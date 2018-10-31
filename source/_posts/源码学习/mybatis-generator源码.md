---
title: mybatis-generator源码
date: 2018-09-12 16:12:30
tags:
- mybatis
categories:
- 源码
---

# mybatis-generator源码

## 一、xml规范dtd文件解读

框架中很多配置文件都是用的xml，对于xml的格式约束分两种dtd和schema两种，mybatis-generator使用的就是dtd方式。有时候在写配置的时候不看文档的话不知道如何配置，不知道都有哪些节点，节点都有哪些属性，这时可以通过配置文件的约束dtd来查看。

- 元素声明

- ```xml
  <!ELEMENT generatorConfiguration (properties?, classPathEntry*, context+)>
  ```

通过`ELEMENT`声明了generatorConfiguration元素及其子元素。

通过通配符声明子元素的个数 `?`标示0个或者1个，`*`标示0个或者多个，`+`标示大于等于1个

- 属性声明

  ```xml
  <!ATTLIST context id ID #REQUIRED
    defaultModelType CDATA #IMPLIED
    targetRuntime CDATA #IMPLIED
    introspectedColumnImpl CDATA #IMPLIED>
  ```

通过`ATTLIST`声明元素的属性，`#REQUIRED`标识属性为必须的，`#IMPLIED`标识属性为可选的

## 二、整体过程

![](https://image-1257941127.cos.ap-beijing.myqcloud.com/codeGene1.jpg)

配置解析按照元素及属性顺序解析

![](https://image-1257941127.cos.ap-beijing.myqcloud.com/codeGene2.jpg)

## 三、代码片段

- 反射数据库表

```java
 public List<IntrospectedTable> introspectTables(TableConfiguration tc)
              throws SQLException {
     //获取数据库表到数据库表列的map
     Map<ActualTableName, List<IntrospectedColumn>> columns = getColumns(tc);
     if (columns.isEmpty()) {
         return null;
     }
     //应用配置文件的配置
     removeIgnoredColumns(tc, columns);
     calculateExtraColumnInformation(tc, columns);
     applyColumnOverrides(tc, columns);
     calculateIdentityColumns(tc, columns);

     List<IntrospectedTable> introspectedTables = calculateIntrospectedTables(
         tc, columns);
     return introspectedTables;
 }
```


- 生成文件对象 GeneratedJavaFile GeneratedXmlFile

```java
public void generateFiles(ProgressCallback callback,
        List<GeneratedJavaFile> generatedJavaFiles,
        List<GeneratedXmlFile> generatedXmlFiles, List<String> warnings)
        throws InterruptedException {
	//聚合插件的功能
    pluginAggregator = new PluginAggregator();
    for (PluginConfiguration pluginConfiguration : pluginConfigurations) {
        Plugin plugin = ObjectFactory.createPlugin(this,
                pluginConfiguration);
        if (plugin.validate(warnings)) {
            pluginAggregator.addPlugin(plugin);
        } else {
            warnings.add(getString("Warning.24", //$NON-NLS-1$
                    pluginConfiguration.getConfigurationType(), id));
        }
    }

    if (introspectedTables != null) {
        for (IntrospectedTable introspectedTable : introspectedTables) {
            callback.checkCancel();
            //构建要生成的文件的名称
            introspectedTable.initialize();
            //创建生成器，并添加的表配置中
            introspectedTable.calculateGenerators(warnings, callback);
            generatedJavaFiles.addAll(introspectedTable
                    .getGeneratedJavaFiles());
            generatedXmlFiles.addAll(introspectedTable
                    .getGeneratedXmlFiles());
			//支持插件扩展(基于配置表)
            generatedJavaFiles.addAll(pluginAggregator
                    .contextGenerateAdditionalJavaFiles(introspectedTable));
            generatedXmlFiles.addAll(pluginAggregator
                    .contextGenerateAdditionalXmlFiles(introspectedTable));
        }
    }
	//支持额外文件生成扩展
    generatedJavaFiles.addAll(pluginAggregator
            .contextGenerateAdditionalJavaFiles());
    generatedXmlFiles.addAll(pluginAggregator
            .contextGenerateAdditionalXmlFiles());
}
```

- 生成java文件对象类

```java
public abstract class GeneratedFile {
	//目标工程
    protected String targetProject;
}
```

```java
public class GeneratedJavaFile extends GeneratedFile {
	//要生成的文件
    private CompilationUnit compilationUnit;
	//字符集
    private String fileEncoding;
	//格式化
    private JavaFormatter javaFormatter;
    
    @Override
    public String getFormattedContent() {
        return javaFormatter.getFormattedContent(compilationUnit);
    }

}
```

生成文件的元素对象关系图

![](https://image-1257941127.cos.ap-beijing.myqcloud.com/codeGene3.jpg)

最终生成的java文件都是`TopLevelClass`、`Interface`、`TopLevelEnumeration`,都继承了`CompilationUnit`类。在这些元素对象中实现了默认的格式化输出，当调用`JavaFormatter`的时候会调用元素的默认实现


- 写文件

```java
private void writeGeneratedJavaFile(GeneratedJavaFile gjf, ProgressCallback callback)
        throws InterruptedException, IOException {
    File targetFile;
    String source;
    try {
        File directory = shellCallback.getDirectory(gjf
                .getTargetProject(), gjf.getTargetPackage());
        targetFile = new File(directory, gjf.getFileName());
        if (targetFile.exists()) {
            //通过shellCallback来控制是否能够跟之前生成的代码合并 需要自己实现
            if (shellCallback.isMergeSupported()) {
                source = shellCallback.mergeJavaFile(gjf
                        .getFormattedContent(), targetFile,
                        MergeConstants.OLD_ELEMENT_TAGS,
                        gjf.getFileEncoding());
            } else if (shellCallback.isOverwriteEnabled()) {
                source = gjf.getFormattedContent();
                warnings.add(getString("Warning.11", //$NON-NLS-1$
                        targetFile.getAbsolutePath()));
            } else {
                source = gjf.getFormattedContent();//格式化
                targetFile = getUniqueFileName(directory, gjf.getFileName());
                warnings.add(getString( "Warning.2", targetFile.getAbsolutePath())); 
            }
        } else {
            source = gjf.getFormattedContent();
        }
        callback.checkCancel();
        callback.startTask(getString("Progress.15", targetFile.getName())); //$NON-NLS-1$
        writeFile(targetFile, source, gjf.getFileEncoding());//写文件
    } catch (ShellException e) {
        warnings.add(e.getMessage());
    }
}
```


- 加载外部jar包

```java
public static ClassLoader getCustomClassloader(Collection<String> entries) {
    List<URL> urls = new ArrayList<URL>();
    File file;
    if (entries != null) {
        for (String classPathEntry : entries) {
            file = new File(classPathEntry);
            if (!file.exists()) {
                throw new RuntimeException(getString("RuntimeError.9", classPathEntry)); 
            }
            try {
                urls.add(file.toURI().toURL());
            } catch (MalformedURLException e) {
                // this shouldn't happen, but just in case...
                throw new RuntimeException(getString( "RuntimeError.9", classPathEntry)); 
            }
        }
    }
    //创建URLClassLoader，并指定当前线程的类加载器为父类加载器
    ClassLoader parent = Thread.currentThread().getContextClassLoader();
    URLClassLoader ucl = new URLClassLoader(urls.toArray(new URL[urls
            .size()]), parent);
    return ucl;
}
```

- 国际化

```java
public class Messages {
    private static final String BUNDLE_NAME = "org.mybatis.generator.internal.util.messages.messages"; //$NON-NLS-1$

    private static final ResourceBundle RESOURCE_BUNDLE = ResourceBundle
            .getBundle(BUNDLE_NAME);

    private Messages() {
    }

    public static String getString(String key) {
        try {
            return RESOURCE_BUNDLE.getString(key);
        } catch (MissingResourceException e) {
            return '!' + key + '!';
        }
    }
    public static String getString(String key, String parm1) {
        try {
            return MessageFormat.format(RESOURCE_BUNDLE.getString(key),
                    new Object[] { parm1 });
        } catch (MissingResourceException e) {
            return '!' + key + '!';
        }
    }
}
```

