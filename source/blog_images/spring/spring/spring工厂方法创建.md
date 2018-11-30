---
title: spring工厂方法创建
date: 2018-09-20 11:11:03
tags:
- spring 
categories:
- spring

---

# spring工厂方法创建

在spring创建bean流程中说到创建bean对象有两种方式，工厂方法和构造器，工厂方法优先级高。

## diff FactoryBean

实现FactoryBean接口的实例是spring中一种特殊的bean。

对象工厂模式和静态工厂模式更多的是为了提供一个创建bean的工具。

> In Spring documentation, factory bean refers to a bean that is configured in the Spring container that will create objects through an 
> instance or static factory method. By contrast, FactoryBean (notice the capitalization) refers to a Spring-specific FactoryBean.

## 使用方法

### 静态工厂

定义一个静态工厂类,声明一个静态方法，用于构建所需对象。

```java
public class TestStaticFactory {
    public static Dog createInstance0(String name) {
        Dog dog = new Dog(name);
        return dog;
    }
    public static Dog createInstance1(String name) {
        Dog dog = new Dog(name);
        return dog;
    }
}
```
在xml文件中声明bean，指定factory-method，这个时候dog映射到的对象就是createInstance创建的Dog对象。使用 construtor-arg 元素为工厂方法传递方法参数
```xml
<bean id = "dog0" class="cn.zlz.beans.factorymethod.TestStaticFactory" factory-method="createInstance0">
    <constructor-arg index="0" value="小黑子0"/>
</bean>
<bean id = "dog1" class="cn.zlz.beans.factorymethod.TestStaticFactory" factory-method="createInstance1">
    <constructor-arg index="0" value="小黑子1"/>
</bean>
```

### 对象工厂

定义一个对象工厂类，一个factory-bean可以有多个factory-method

```java
@Data
public class TestInstanceFactory {
    private String factoryName;
    public Dog createInstance0(String name){
        System.out.println(factoryName);
        Dog dog = new Dog(name);
        return dog;
    }
    public Dog createInstance1(String name){
        System.out.println(factoryName);
        Dog dog = new Dog(name);
        return dog;
    }
}
```

xml中配置，将工厂类声明为一个spring容易的bean，通过factory-bean指定工厂类对象，factory-method指定工厂方法。使用 construtor-arg 元素为工厂方法传递方法参数

```xml
<!---工厂类对象也是spring容器中的一个bean-->
<bean id = "testInstanceFactory" class="cn.zlz.beans.factorymethod.TestInstanceFactory" >
    <property name="factoryName" value="狗场"/>
</bean>
<!--对象工厂中可以声明多个工厂方法-->

<bean id = "dog0" factory-bean="testInstanceFactory" factory-method="createInstance0">
    <constructor-arg name="name" value="小黑"/>
</bean>
<bean id = "dog1" factory-bean="testInstanceFactory" factory-method="createInstance1">
    <constructor-arg name="name" value="小白"/>
</bean>
```



## 源码解读

在createBeanInstan方法中创建bean对象，当有BeanDefinition中有工厂方法时，调用工厂方法创建对象

```java
//args 对应getBean(beanName,args)中传进来的参数
if (mbd.getFactoryMethodName() != null)  {
    return instantiateUsingFactoryMethod(beanName, mbd, args);
}
```

调用ConstructorResolver中的instantiateUsingFactoryMethod方法创建对象,首先创建一个BeanWrapperImpl对象

```java
BeanWrapperImpl bw = new BeanWrapperImpl();
this.beanFactory.initBeanWrapper(bw);//注册类型转换器
```

工厂方法分静态工厂方法和对象工厂方法，通过判断是否配置了factory-bean来区分。对象工厂模式下对象工厂也是spring容器的一个bean，需要调用spring容器的getBean初始化工厂bean。

```java
String factoryBeanName = mbd.getFactoryBeanName();
if (factoryBeanName != null) {//配置了factory-bean  对象工厂模式
    if (factoryBeanName.equals(beanName)) {
        throw new BeanDefinitionStoreExceptio("...");
    }//初始化对象工厂bean
    factoryBean = this.beanFactory.getBean(factoryBeanName);
    if (factoryBean == null) {
        throw new BeanCreationException("...");
    }
    if (mbd.isSingleton() && this.beanFactory.containsSingleton(beanName)) {
        throw new IllegalStateException("...");
    }
    factoryClass = factoryBean.getClass();
    isStatic = false; //对象工厂模式
} else {
    // It's a static factory method on the bean class.
    if (!mbd.hasBeanClass()) {
        throw new BeanDefinitionStoreException("...");
    }
    factoryBean = null;
    factoryClass = mbd.getBeanClass();
    isStatic = true;//静态工厂模式
}
```

使用工厂方法创建对象，就是找到匹配的工厂方法，然后反射调用。遍历工厂类中的所有方法，查找跟工厂方法名称一样的方法

```java
Method[] rawCandidates = getCandidateMethods(factoryClass, mbd);//反射获取工厂类的所有方法
List<Method> candidateSet = new ArrayList<Method>();
//循环所有方法，根据是否静态和 方法名称匹配 BeanDefinition中配置的工厂方法
for (Method candidate : rawCandidates) {
    if (Modifier.isStatic(candidate.getModifiers()) == isStatic && mbd.isFactoryMethod(candidate)) {//(candidate != null && candidate.getName().equals(getFactoryMethodName()))
        candidateSet.add(candidate);
    }
}
```

找到名称匹配的方法，然后就是匹配参数。工厂方法的参数可以显示通过getBean()指定，也可以使用 construtor-arg 元素为工厂方法传递方法参数

```java
if (explicitArgs != null) {//通过getBean(args) 显示指定了参数
    minNrOfArgs = explicitArgs.length;
} else {
    //获取工厂类构造器配置的 参数
    ConstructorArgumentValues cargs = mbd.getConstructorArgumentValues();
    resolvedValues = new ConstructorArgumentValues();
    minNrOfArgs = resolveConstructorArguments(beanName, mbd, bw, cargs, resolvedValues);
}
LinkedList<UnsatisfiedDependencyException> causes = null;
//循环所有名称匹配的方法，根据参数找匹配度最高的方法
for (Method candidate : candidates) {
    Class<?>[] paramTypes = candidate.getParameterTypes();
	//先根据参数的个数判断
    if (paramTypes.length >= minNrOfArgs) {
        ArgumentsHolder argsHolder;
        if (resolvedValues != null) {//依赖工厂类构造器传递参数
            try {
                String[] paramNames = null;
                ParameterNameDiscoverer pnd = this.beanFactory.getParameterNameDiscoverer();
                if (pnd != null) {
                    paramNames = pnd.getParameterNames(candidate);
                }//解析构造器参数 和 工厂方法参数，建立对应关系
                argsHolder = createArgumentArray(
                    beanName, mbd, resolvedValues, bw, paramTypes, paramNames, candidate, autowiring);
            }
            catch (UnsatisfiedDependencyException ex) {
                continue;
            }
        } else { //通过getBean 显示指定了参数，直接使用
            if (paramTypes.length != explicitArgs.length) {
                continue;
            }
            argsHolder = new ArgumentsHolder(explicitArgs);
        }

        int typeDiffWeight = (mbd.isLenientConstructorResolution() ?
                              argsHolder.getTypeDifferenceWeight(paramTypes) : argsHolder.getAssignabilityWeight(paramTypes));
        // 使用匹配度最高的方法和参数
        if (typeDiffWeight < minTypeDiffWeight) {
            factoryMethodToUse = candidate;
            argsHolderToUse = argsHolder;
            argsToUse = argsHolder.arguments;
            minTypeDiffWeight = typeDiffWeight;
            ambiguousFactoryMethods = null;
        } else if (factoryMethodToUse != null && typeDiffWeight == minTypeDiffWeight &&
                   !mbd.isLenientConstructorResolution() &&
                   paramTypes.length == factoryMethodToUse.getParameterTypes().length &&
                   !Arrays.equals(paramTypes, factoryMethodToUse.getParameterTypes())) {
            if (ambiguousFactoryMethods == null) {
                ambiguousFactoryMethods = new LinkedHashSet<Method>();
                ambiguousFactoryMethods.add(factoryMethodToUse);
            }
            ambiguousFactoryMethods.add(candidate);
        }
    }
}

```

使用匹配到的工厂方法和参数值反射创建对象

```java
beanInstance = this.beanFactory.getInstantiationStrategy().instantiate(
    mbd, beanName, this.beanFactory, factoryBean, factoryMethodToUse, argsToUse);

//反射调用method创建对象，如果是静态工厂，factoryBean为空，args为解析到的方法的参数
ReflectionUtils.makeAccessible(factoryMethod);
return factoryMethod.invoke(factoryBean, args);
```







