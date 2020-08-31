---
title: spring-mvc(一) 启动实现
date: 2020-07-01
tags:
- spring 
categories:
- spring



---

# spring-mvc(一) 启动实现

DispatchServlet

AbstractController

SimpleUrlHanlerMapping

ContextLoaderListener:作用是启动web容器时，初始化spring容器WebApplicationContext并存放到ServletContext中，该类实现了ServletContextListener接口，在web容器启动时会调用contextInitialized方法。



调用父类ContextLoader中的initWebApplicationContext方法，初始化spring容器，并添加到servletContext中

```java
public WebApplicationContext initWebApplicationContext(ServletContext servletContext) {
  //保证spring容器只初始化一次，初始化成功会放到servletContext
  	if (servletContext.getAttribute(WebApplicationContext.ROOT_WEB_APPLICATION_CONTEXT_ATTRIBUTE) != null) {
			throw new IllegalStateException(
					"Cannot initialize context because there is already a root application context present - " +
					"check whether you have multiple ContextLoader* definitions in your web.xml!");
		}
   servletContext.log("Initializing Spring root WebApplicationContext");
   Log logger = LogFactory.getLog(ContextLoader.class);
   if (logger.isInfoEnabled()) {
      logger.info("Root WebApplicationContext: initialization started");
   }
   long startTime = System.currentTimeMillis();

   try {
     //初始化spring容器
      if (this.context == null) {
         this.context = createWebApplicationContext(servletContext);
      }
      if (this.context instanceof ConfigurableWebApplicationContext) {
         ConfigurableWebApplicationContext cwac = (ConfigurableWebApplicationContext) this.context;
         if (!cwac.isActive()) {
            // The context has not yet been refreshed -> provide services such as
            // setting the parent context, setting the application context id, etc
            if (cwac.getParent() == null) {
               // The context instance was injected without an explicit parent ->
               // determine parent for root web application context, if any.
               ApplicationContext parent = loadParentContext(servletContext);
               cwac.setParent(parent);
            }
            configureAndRefreshWebApplicationContext(cwac, servletContext);
         }
      }
     //将spring容器配置到 servletContext 中
      servletContext.setAttribute(WebApplicationContext.ROOT_WEB_APPLICATION_CONTEXT_ATTRIBUTE, this.context);

      ClassLoader ccl = Thread.currentThread().getContextClassLoader();
      if (ccl == ContextLoader.class.getClassLoader()) {
         currentContext = this.context;
      } else if (ccl != null) {
         currentContextPerThread.put(ccl, this.context);
      }
      return this.context;
   } catch (RuntimeException | Error ex) {
    //此处省略代码....
   }
}
```

创建spring容器，首先匹配适合的ApplicationContext实现类，然后反射创建对象

```java
protected WebApplicationContext createWebApplicationContext(ServletContext sc) {
   Class<?> contextClass = determineContextClass(sc);
   if (!ConfigurableWebApplicationContext.class.isAssignableFrom(contextClass)) {
      throw new ApplicationContextException("Custom context class [" + contextClass.getName() +
            "] is not of type [" + ConfigurableWebApplicationContext.class.getName() + "]");
   }
   return (ConfigurableWebApplicationContext) BeanUtils.instantiateClass(contextClass);
}
```

调用determineContextClass获取spring容器WebApplicationContext的实现类，如果通过contextClass配置了则使用配置的，如果没有自定义配置则使用默认的 XmlWebApplicationContext

```java
protected Class<?> determineContextClass(ServletContext servletContext) {
  //首先获取context-param中配置的 contextClass 属性，如果有，使用其作为spring容器
   String contextClassName = servletContext.getInitParameter(CONTEXT_CLASS_PARAM);
   if (contextClassName != null) {
      try {
         return ClassUtils.forName(contextClassName, ClassUtils.getDefaultClassLoader());
      } catch (ClassNotFoundException ex) {
         throw new ApplicationContextException(
               "Failed to load custom context class [" + contextClassName + "]", ex);
      }
   } else {
     //否则使用默认配置文件中配置的 XmlWebApplicationContext
      contextClassName = defaultStrategies.getProperty(WebApplicationContext.class.getName());
      try {
         return ClassUtils.forName(contextClassName, ContextLoader.class.getClassLoader());
      } catch (ClassNotFoundException ex) {
         throw new ApplicationContextException(
               "Failed to load default context class [" + contextClassName + "]", ex);
      }
   }
}
```



![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/RIMj7j.jpg)

