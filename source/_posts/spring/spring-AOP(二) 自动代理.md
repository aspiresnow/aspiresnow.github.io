---
title: spring-AOP(二)
date: 2020-06-15
tags:
- spring 
categories:
- spring

---

# spring-AOP(二) 自动代理

## 知识导读

- 在何时何处创建代理对象，如何能覆盖被代理对象，返回代理后的对象
- 自动代理工作流程
  - 拦截获取初始化完成的目标对象
  - 在spring容器中查找适合目标对象的Advisor
  - 调用ProxyFactory创建代理
  - 返回代理对象，完成对目标对象的覆盖，注册到spring容器
- Advisor查找、筛选、排序
- 查找Advisor的时候，只要切点能拦截目标类中的任意一个方法就返回，在方法执行的时候还会再次判断目标方法
- AOP注解的解析，转换封装为Advisor
- 不同的通知类型创建对应的Advice实现类对象

下图是AOP自动代理的流程图

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/67Re7k.jpg)

spring中已经定义了创建代理的工厂类 ProxyFactory，通过 ProxyFactory 创建代理，必须要一个被代理对象和一个增强Advisor列表

spring的动态代理实质就是对象创建完毕之后，查找筛选能够应用于该对象上的Advisor列表，然后调用ProxyFactory创建代理对象返回。

## 自动代理

Spring中定义了 AbstractAutoProxyCreator 类用于实现自动代理。

- AbstractAutoProxyCreator 封装了自动创建代理的总逻辑，将对Advisor的处理交由子类实现
- AbstractAdvisorAutoProxyCreator 封装了查找Advisor、筛选Advisor、排序Advisor的逻辑，最终返回应用于目标对象的Advisor列表，
- AspectJAwareAdvisorAutoProxyCreator 封装了基于 @Aspect 声明的同一切面下通知的排序逻辑
- AnnotationAwareAspectJAutoProxyCreator 扩展了获取Advisor的途径，可以扫描 @Aspect 注解获取Advisor

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/epnEyA.jpg)

### 创建时机

从继承图可以看出该类实现了 BeanPostProcessor 接口，覆写了postProcessAfterInitialization 方法。spring的bean初始化完成后会遍历注册的所有BeanPostProcessor实现类对象，调用其postProcessAfterInitialization方法，该方法可以返回一个新的对象覆盖原有对象，在此spring提供一个创建代理并覆盖被代理对象的机会

```java
protected Object initializeBean(final String beanName, final Object bean, @Nullable RootBeanDefinition mbd) {
  //此处省略代码
   Object wrappedBean = bean;
   if (mbd == null || !mbd.isSynthetic()) {//初始化前应用 BeanPostProcessorsBeforeInitialization
      wrappedBean = applyBeanPostProcessorsBeforeInitialization(wrappedBean, beanName);
   }
  
   try {
      invokeInitMethods(beanName, wrappedBean, mbd);
   }catch (Throwable ex) {
     
   }
   if (mbd == null || !mbd.isSynthetic()) {
     //应用BeanPostProcessorsA中的postProcessAfterInitialization方法
      wrappedBean = applyBeanPostProcessorsAfterInitialization(wrappedBean, beanName);
   }
   //返回的可能是postProcessAfterInitialization代理后的代理对象
   return wrappedBean;
}
```
遍历容器中注册的所有BeanPostProcessor，调用postProcessAfterInitialization方法，如果返回一个新的对象会覆盖掉原始对象注册到spring容器中
```java
@Override
public Object applyBeanPostProcessorsAfterInitialization(Object existingBean, String beanName)
      throws BeansException {
   Object result = existingBean;//被代理对象
   for (BeanPostProcessor processor : getBeanPostProcessors()) {
      Object current = processor.postProcessAfterInitialization(result, beanName);
      if (current == null) {
        //这里 如果有一个BeanPostProcessor返回空，就不在应用后续的BeanPostProcessor，实现短路操作
         return result;
      }//多层代理的实现
      result = current;
   }
   return result;
}
```

### 注册AbstractAutoProxyCreator的实现类

上面分析了AbstractAutoProxyCreator是实现自动代理的关键，那么在spring中如何配置一个AbstractAutoProxyCreator的实现类对象呢，spring又是如何根据配置注册该对象的

在spring中可以通过两种配置，启动自动代理

1. 在xml中启动

```xml
<aop:aspectj-autoproxy proxy-target-class="true" expose-proxy="true" />
```

2. 在配置文件上通过注解启动 @EnableAspectJAutoProxy

```java
@Configuration
@EnableAspectJAutoProxy
public class AppConfig {
}
```

这两中方法最终都是向spring容器中注册了一个AnnotationAwareAspectJAutoProxyCreator实例，这样在spring初始化完对象后就可以调用AnnotationAwareAspectJAutoProxyCreator的postProcessAfterInitialization方法了

```java
BeanDefinition beanDefinition = AopConfigUtils.registerAspectJAnnotationAutoProxyCreatorIfNecessary(
      parserContext.getRegistry(), parserContext.extractSource(sourceElement));
```

```java
public static BeanDefinition registerAspectJAnnotationAutoProxyCreatorIfNecessary(
      BeanDefinitionRegistry registry, @Nullable Object source) {
//注册AnnotationAwareAspectJAutoProxyCreator实例
   return registerOrEscalateApcAsRequired(AnnotationAwareAspectJAutoProxyCreator.class, registry, source);
}
```

### AbstractAutoProxyCreator自动代理实现

上面分析了spring是在何时何处开始创建代理的，解下来分析AbstractAutoProxyCreator进行自动代理的总体实现

```java
@Override
public Object postProcessAfterInitialization(@Nullable Object bean, String beanName) {
   if (bean != null) {
      Object cacheKey = getCacheKey(bean.getClass(), beanName);
      if (this.earlyProxyReferences.remove(cacheKey) != bean) {
         return wrapIfNecessary(bean, beanName, cacheKey);
      }
   }
   return bean;
}
```

在postProcessAfterInitialization方法中判断 被代理对象不为空，调用wrapIfNecessary判断是否对目标类进行代理

1. 快速判断该类是否需要代理，如果不需要直接返回目标对象。
2. 调用子类实现获取可应用于目标类的Advisor列表
3. 如果存在Advisor ,调用 ProxyFactory创建目标对象的代理对象返回，否则返回目标对象

```java
protected Object wrapIfNecessary(Object bean, String beanName, Object cacheKey) {
   if (StringUtils.hasLength(beanName) && this.targetSourcedBeans.contains(beanName)) {
      return bean;
   }
   if (Boolean.FALSE.equals(this.advisedBeans.get(cacheKey))) {
      return bean;
   }
  //快速判断是否跳过对目标的代理，如果目标类是AOP基础类或者查找不到应用该类的 Advisor，无需代理，并且缓存下来，避免下次再次解析判断
   if (isInfrastructureClass(bean.getClass()) || shouldSkip(bean.getClass(), beanName)) {
      this.advisedBeans.put(cacheKey, Boolean.FALSE);
      return bean;
   }
   //获取应用目标对象的 Advisor 列表
   Object[] specificInterceptors = getAdvicesAndAdvisorsForBean(bean.getClass(), beanName, null);
   if (specificInterceptors != DO_NOT_PROXY) {
      this.advisedBeans.put(cacheKey, Boolean.TRUE);
     //查找到 增强Advisor 列表，现在有了目标对象和 Advisor 列表，调用ProxyFactory创建对象
      Object proxy = createProxy(
            bean.getClass(), beanName, specificInterceptors, new SingletonTargetSource(bean));
      this.proxyTypes.put(cacheKey, proxy.getClass());
      return proxy;
   }

   this.advisedBeans.put(cacheKey, Boolean.FALSE);
   return bean;
}
```

createProxy方法中通过ProxyFactory设置AOP配置，如被代理对象和Advisor列表，调用getProxy创建代理对象。

```java
protected Object createProxy(Class<?> beanClass, @Nullable String beanName,
      @Nullable Object[] specificInterceptors, TargetSource targetSource) {
   if (this.beanFactory instanceof ConfigurableListableBeanFactory) {
      AutoProxyUtils.exposeTargetClass((ConfigurableListableBeanFactory) this.beanFactory, beanName, beanClass);
   }//创建 ProxyFactory 对象
   ProxyFactory proxyFactory = new ProxyFactory();
   proxyFactory.copyFrom(this);
   if (!proxyFactory.isProxyTargetClass()) {
      if (shouldProxyTargetClass(beanClass, beanName)) {
         proxyFactory.setProxyTargetClass(true);
      }else {//解析目标类的 所有接口
         evaluateProxyInterfaces(beanClass, proxyFactory);
      }
   }//该处主要是为了将Advice、MethodInterceptor 统一简单封装为 Advisor
   Advisor[] advisors = buildAdvisors(beanName, specificInterceptors);
   proxyFactory.addAdvisors(advisors);
   proxyFactory.setTargetSource(targetSource);
   customizeProxyFactory(proxyFactory);//供子类扩展实现
   proxyFactory.setFrozen(this.freezeProxy);
   if (advisorsPreFiltered()) {
      proxyFactory.setPreFiltered(true);
   }//调用proxyFactory的getProxy 创建代理对象返回
   return proxyFactory.getProxy(getProxyClassLoader());
}
```

至此AbstractAutoProxyCreator完成了自动创建代理的总体实现，在该抽象类中没有实现获取Adviso列表r的功能，交由各个子类去实现。


## 查找封装目标类的Advisor

分析完spring自动代理的整体实现，接下来看下AbstractAutoProxyCreator的子类AbstractAdvisorAutoProxyCreator是如何进行查找 Advisor、筛选Advisor、排序Advisor的。

AbstractAdvisorAutoProxyCreator实现了getAdvicesAndAdvisorsForBean方法，用于获取应用于目标类的Advisor列表

```java
protected Object[] getAdvicesAndAdvisorsForBean(
      Class<?> beanClass, String beanName, @Nullable TargetSource targetSource) {
   //查找应用于目标类的Advisor列表
   List<Advisor> advisors = findEligibleAdvisors(beanClass, beanName);
   if (advisors.isEmpty()) {
      return DO_NOT_PROXY;
   }
   return advisors.toArray();
}
```

在findEligibleAdvisors方法定义了查找 Advisor、筛选Advisor、排序Advisor三步操作

```java
protected List<Advisor> findEligibleAdvisors(Class<?> beanClass, String beanName) {
  //查找容器中所有的 Advisor
   List<Advisor> candidateAdvisors = findCandidateAdvisors();
  //筛选应用于目标类的 Advisor
   List<Advisor> eligibleAdvisors = findAdvisorsThatCanApply(candidateAdvisors, beanClass, beanName);
   extendAdvisors(eligibleAdvisors);
   if (!eligibleAdvisors.isEmpty()) {
     //将Advisor排序
      eligibleAdvisors = sortAdvisors(eligibleAdvisors);
   }
   return eligibleAdvisors;
}
```

### 1、查找容器中注册的Advisor bean

```xml
<aop:advisor id="" order="" advice-ref="aopAdvice" pointcut="" pointcut-ref="" />
```

在spring中可以通过注册Advisor的bean来实现对目标类的增强代理。spring会筛选出容器中所有Advisor类型的bean，用于对容器中的对象进行增强代理，查找的功能由AbstractAdvisorAutoProxyCreator类实现

```java
protected List<Advisor> findCandidateAdvisors() {
   Assert.state(this.advisorRetrievalHelper != null, "No BeanFactoryAdvisorRetrievalHelper available");
   return this.advisorRetrievalHelper.findAdvisorBeans();
}
```

将查找功能委托给advisorRetrievalHelper(BeanFactoryAdvisorRetrievalHelperAdapter)实现，该方法的功能就是获取Advisor类型的bean对象返回

```java
public List<Advisor> findAdvisorBeans() {
   String[] advisorNames = this.cachedAdvisorBeanNames;
   if (advisorNames == null) {
      //获取spring容器中 Advisor类型的 beanName
      advisorNames = BeanFactoryUtils.beanNamesForTypeIncludingAncestors(
            this.beanFactory, Advisor.class, true, false);
      this.cachedAdvisorBeanNames = advisorNames;
   }
   //此处省略代码。。。。
   List<Advisor> advisors = new ArrayList<>();
   for (String name : advisorNames) {
     //根据name获取Advisor类型的bean，返回
     advisors.add(this.beanFactory.getBean(name, Advisor.class));
   }
   return advisors;
}
```

### 2、解析封装@Aspect声明的Advisor

spring除了支持配置或者手动注册 Advisor类型的bean之外，还支持通过 @Aspect、@Before、@After等AOP注解来声明Advisor。Advisor的查找解析由子类AnnotationAwareAspectJAutoProxyCreator实现

在AnnotationAwareAspectJAutoProxyCreator的findCandidateAdvisors方法中，第一步首先调父类的方法获取到容器中注册的所有Advisor，然后再委托aspectJAdvisorsBuilder解析注解获取Advisor，然后合并两个结果返回

```java
@Override
protected List<Advisor> findCandidateAdvisors() {
   // 首先应用父类中查找 Advisor，会查询到容器中注册的所有 Advisor类型的bean
   List<Advisor> advisors = super.findCandidateAdvisors();
   if (this.aspectJAdvisorsBuilder != null) {
     //调用aspectJAdvisorsBuilder解析注解，生成Advisor
      advisors.addAll(this.aspectJAdvisorsBuilder.buildAspectJAdvisors());
   }
  //将以上两种途径得到的Advisor一起返回
   return advisors;
}
```

BeanFactoryAspectJAdvisorsBuilder.buildAspectJAdvisors方法解析AOP注解封装为Advisor对象。

1. 遍历容器中所有的bean，筛选标注 @Aspect 注解的bean，查找切面
2. 循环委托 advisorFactory 来解析切面，将切面解析为 List<Advisor>。
3. 将切面解析结果缓存起来，避免重复解析

```java
public List<Advisor> buildAspectJAdvisors() {
  //用于缓存
   List<String> aspectNames = this.aspectBeanNames;
   if (aspectNames == null) {
      synchronized (this) {
         aspectNames = this.aspectBeanNames;
         if (aspectNames == null) {
            List<Advisor> advisors = new ArrayList<>();
            aspectNames = new ArrayList<>();
            String[] beanNames = BeanFactoryUtils.beanNamesForTypeIncludingAncestors(
                  this.beanFactory, Object.class, true, false);
            for (String beanName : beanNames) {
               if (!isEligibleBean(beanName)) {
                  continue;
               }
               Class<?> beanType = this.beanFactory.getType(beanName);
               if (beanType == null) {
                  continue;
               }
          //查找带有 @Aspect 注解的类(AnnotationUtils.findAnnotation(clazz, Aspect.class) != null)
               if (this.advisorFactory.isAspect(beanType)) {
                  aspectNames.add(beanName);
                  AspectMetadata amd = new AspectMetadata(beanType, beanName);
                  if (amd.getAjType().getPerClause().getKind() == PerClauseKind.SINGLETON) {
                     MetadataAwareAspectInstanceFactory factory =
                           new BeanFactoryAspectInstanceFactory(this.beanFactory, beanName);
                    //委托 advisorFactory 来解析切面中的通知 
                     List<Advisor> classAdvisors = this.advisorFactory.getAdvisors(factory);
                    //将结果缓存
                    if (this.beanFactory.isSingleton(beanName)) {
                        this.advisorsCache.put(beanName, classAdvisors);
                     }
                     else {
                        this.aspectFactoryCache.put(beanName, factory);
                     }
                     advisors.addAll(classAdvisors);
                  }else {
                     //此处省略。。。。
                  }
               }
            }
            this.aspectBeanNames = aspectNames;
            return advisors;
         }
      }
   }
   //从缓存中获取
   if (aspectNames.isEmpty()) {
      return Collections.emptyList();
   }
  //将解析结果添加到缓存
   List<Advisor> advisors = new ArrayList<>();
   for (String aspectName : aspectNames) {
      List<Advisor> cachedAdvisors = this.advisorsCache.get(aspectName);
      if (cachedAdvisors != null) {
         advisors.addAll(cachedAdvisors);
      } else {
         MetadataAwareAspectInstanceFactory factory = this.aspectFactoryCache.get(aspectName);
         advisors.addAll(this.advisorFactory.getAdvisors(factory));
      }
   }
   return advisors;
}
```

spring定义了一个AspectJAdvisorFactory接口用于解析AOP的注解,接口主要定义了两个功能

1. getAdvisors 解析切面，将通知方法和方法上的切点表达式封装为Advisor，返回Advisor列表
2. getAdvice 根据通知方法上的各个注解类型选择使用不同的Advice实现类

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/CNPqEK.jpg)

AspectJAdvisorFactory的实现类ReflectiveAspectJAdvisorFactory提供了具体实现

1. 遍历切面中的所有方法，查找到带有AOP注解的通知方法和对应的Pointcut表达式
2. 将Advice和Pointcut封装为Advisor返回

```java
@Override
public List<Advisor> getAdvisors(MetadataAwareAspectInstanceFactory aspectInstanceFactory) {
   Class<?> aspectClass = aspectInstanceFactory.getAspectMetadata().getAspectClass();
   String aspectName = aspectInstanceFactory.getAspectMetadata().getAspectName();
   validate(aspectClass);

   MetadataAwareAspectInstanceFactory lazySingletonAspectInstanceFactory =
         new LazySingletonAspectInstanceFactoryDecorator(aspectInstanceFactory);

   List<Advisor> advisors = new ArrayList<>();
  //遍历所有未带有 @Pointcut注解的方法
   for (Method method : getAdvisorMethods(aspectClass)) {
     //封装 Advisor
      Advisor advisor = getAdvisor(method, lazySingletonAspectInstanceFactory, advisors.size(), aspectName);
      if (advisor != null) {
         advisors.add(advisor);
      }
   }
   //此处省略代码...
   //查找引介增强 Advisor
   for (Field field : aspectClass.getDeclaredFields()) {
      Advisor advisor = getDeclareParentsAdvisor(field);
      if (advisor != null) {
         advisors.add(advisor);
      }
   }
   return advisors;
}
```

调用getAdvisor方法，获取通知方法上的Pointcut表达式，如果在方法上未解析到Pointcut，则跳过，然后根据通知方法和对应Pointcut封装返回一个Advisor的实现类InstantiationModelAwarePointcutAdvisorImpl对象

```java
public Advisor getAdvisor(Method candidateAdviceMethod, MetadataAwareAspectInstanceFactory aspectInstanceFactory,
      int declarationOrderInAspect, String aspectName) {

   validate(aspectInstanceFactory.getAspectMetadata().getAspectClass());
   //获取切点
   AspectJExpressionPointcut expressionPointcut = getPointcut(
         candidateAdviceMethod, aspectInstanceFactory.getAspectMetadata().getAspectClass());
  //没有切点的方法，不是通知，过滤掉 
  if (expressionPointcut == null) {
      return null;
   }
 //使用切点和通知方法 组装Advisor对象返回
   return new InstantiationModelAwarePointcutAdvisorImpl(expressionPointcut, candidateAdviceMethod,
         this, aspectInstanceFactory, declarationOrderInAspect, aspectName);
}
```

解析获取通知方法的Pointcut表达式，在该方法中会过滤掉不带Aop注解的非通知型方法，判断一个方法是不是通知就是判断该方法是否声明了切点

```java
private AspectJExpressionPointcut getPointcut(Method candidateAdviceMethod, Class<?> candidateAspectClass) {
  //查找方法上是否有 @Pointcut @Around @Before @After @AfterReturning @AfterThrowing等注解，如果没有这些注解，不是一个通知方法，跳过
   AspectJAnnotation<?> aspectJAnnotation =
         AbstractAspectJAdvisorFactory.findAspectJAnnotationOnMethod(candidateAdviceMethod);
   if (aspectJAnnotation == null) {
      return null;
   }
//找到了代表通知的注解，解析注解上的 pointcut表达式 返回
   AspectJExpressionPointcut ajexp =
         new AspectJExpressionPointcut(candidateAspectClass, new String[0], new Class<?>[0]);
   ajexp.setExpression(aspectJAnnotation.getPointcutExpression());
   if (this.beanFactory != null) {
      ajexp.setBeanFactory(this.beanFactory);
   }
   return ajexp;
}
```

最终封装返回的Advisor是InstantiationModelAwarePointcutAdvisorImpl类型，在该实现类的getAdvice方法会回调ReflectiveAspectJAdvisorFactory中的getAdvice方法，ReflectiveAspectJAdvisorFactory会根据通知方法上不同的注解，创建对应的Advice

```java
class InstantiationModelAwarePointcutAdvisorImpl{
    @Override
    public synchronized Advice getAdvice() {
       if (this.instantiatedAdvice == null) {
          this.instantiatedAdvice = instantiateAdvice(this.declaredPointcut);
       }
       return this.instantiatedAdvice;
    }

    private Advice instantiateAdvice(AspectJExpressionPointcut pointcut) {
       Advice advice = this.aspectJAdvisorFactory.getAdvice(this.aspectJAdviceMethod, pointcut,
             this.aspectInstanceFactory, this.declarationOrder, this.aspectName);
       return (advice != null ? advice : EMPTY_ADVICE);
    }
}
```

回调ReflectiveAspectJAdvisorFactory中的getAdvice，策略创建对应的Advice实现类对象

```java
public Advice getAdvice(Method candidateAdviceMethod, AspectJExpressionPointcut expressionPointcut,
      MetadataAwareAspectInstanceFactory aspectInstanceFactory, int declarationOrder, String aspectName) {

   Class<?> candidateAspectClass = aspectInstanceFactory.getAspectMetadata().getAspectClass();
   validate(candidateAspectClass);

   AspectJAnnotation<?> aspectJAnnotation =
         AbstractAspectJAdvisorFactory.findAspectJAnnotationOnMethod(candidateAdviceMethod);
   if (aspectJAnnotation == null) {
      return null;
   }
   AbstractAspectJAdvice springAdvice;
   //根据注解类型选择对应的Advice实现类
   switch (aspectJAnnotation.getAnnotationType()) {
      case AtPointcut:
         return null;
      case AtAround:
         springAdvice = new AspectJAroundAdvice(
               candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
         break;
      case AtBefore:
         springAdvice = new AspectJMethodBeforeAdvice(
               candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
         break;
      case AtAfter://最终通知  在finnaly里面
         springAdvice = new AspectJAfterAdvice(
               candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
         break;
      case AtAfterReturning:
         springAdvice = new AspectJAfterReturningAdvice(
               candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
         AfterReturning afterReturningAnnotation = (AfterReturning) aspectJAnnotation.getAnnotation();
         if (StringUtils.hasText(afterReturningAnnotation.returning())) {
            springAdvice.setReturningName(afterReturningAnnotation.returning());
         }
         break;
      case AtAfterThrowing:
         springAdvice = new AspectJAfterThrowingAdvice(
               candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
         AfterThrowing afterThrowingAnnotation = (AfterThrowing) aspectJAnnotation.getAnnotation();
         if (StringUtils.hasText(afterThrowingAnnotation.throwing())) {
            springAdvice.setThrowingName(afterThrowingAnnotation.throwing());
         }
         break;
      default:
         throw new UnsupportedOperationException(
               "Unsupported advice type on method: " + candidateAdviceMethod);
   }

   springAdvice.setAspectName(aspectName);
   springAdvice.setDeclarationOrder(declarationOrder);
   String[] argNames = this.parameterNameDiscoverer.getParameterNames(candidateAdviceMethod);
   if (argNames != null) {
      springAdvice.setArgumentNamesFromStringArray(argNames);
   }
   springAdvice.calculateArgumentBindings();

   return springAdvice;
}
```

### 3、筛选增强该类某个方法的Advisor

获取到spring容器中所有的Advisor之后，再回到AbstractAdvisorAutoProxyCreator类中，接下来筛选能够应用到目标对象的Advisor。通过Advisor中的Pointcut的ClassFilter和MethodMatcher来对目标对象进行匹配。**在这个阶段的筛选，只要Advisor能应用到目标类型的任意一个方法上都会返回成功**

接下来看AbstractAdvisorAutoProxyCreator.findAdvisorsThatCanApply方法，将筛选的工作委托给AopUtils来实现

```java
protected List<Advisor> findAdvisorsThatCanApply(
      List<Advisor> candidateAdvisors, Class<?> beanClass, String beanName) {

   ProxyCreationContext.setCurrentProxiedBeanName(beanName);
   try {
      return AopUtils.findAdvisorsThatCanApply(candidateAdvisors, beanClass);
   }
   finally {
      ProxyCreationContext.setCurrentProxiedBeanName(null);
   }
}
```

AopUtils.findAdvisorsThatCanApply方法中遍历所有的Advisor，然后调用canApply方法判断是否符合，在当中会区分引介增强和切点增强，引介增强是类级别的，只需要根据切点的ClassFilter对目标类进行判断就行。

```java
public static List<Advisor> findAdvisorsThatCanApply(List<Advisor> candidateAdvisors, Class<?> clazz) {
   if (candidateAdvisors.isEmpty()) {
      return candidateAdvisors;
   }
   List<Advisor> eligibleAdvisors = new ArrayList<>();
   for (Advisor candidate : candidateAdvisors) {
      if (candidate instanceof IntroductionAdvisor && canApply(candidate, clazz)) {
         eligibleAdvisors.add(candidate);
      }
   }
   boolean hasIntroductions = !eligibleAdvisors.isEmpty();
   for (Advisor candidate : candidateAdvisors) {
      if (candidate instanceof IntroductionAdvisor) {
         // already processed
         continue;
      }
      if (canApply(candidate, clazz, hasIntroductions)) {
         eligibleAdvisors.add(candidate);
      }
   }
   return eligibleAdvisors;
}
```

canApply方法中，通过Pointcut来进行匹配，引介增强IntroductionAdvisor直接根据其ClassFilter判断目标类型，PointcutAdvisor根据其中的Pointcut来进行筛选

```java
public static boolean canApply(Advisor advisor, Class<?> targetClass, boolean hasIntroductions) {
   if (advisor instanceof IntroductionAdvisor) {
      return ((IntroductionAdvisor) advisor).getClassFilter().matches(targetClass);
   } else if (advisor instanceof PointcutAdvisor) {
      PointcutAdvisor pca = (PointcutAdvisor) advisor;
     //使用 Pointcut 去筛选
      return canApply(pca.getPointcut(), targetClass, hasIntroductions);
   } else {
      // It doesn't have a pointcut so we assume it applies.
      return true;
   }
}
```

Pointcut会首先使用ClassFilter对目标类型进行过滤。如果通过，再使用 MethodMatcher 校验 类中所有的方法，只要有一个方法匹配上，代表该Advisor符合条件。

```java
public static boolean canApply(Pointcut pc, Class<?> targetClass, boolean hasIntroductions) {
   Assert.notNull(pc, "Pointcut must not be null");
  //首先使用 Pointcut 中的 ClassFilter 对目标类进行判断
   if (!pc.getClassFilter().matches(targetClass)) {
      return false;
   }
  // 获取 Pointcut 中的 MethodMatcher
   MethodMatcher methodMatcher = pc.getMethodMatcher();
  //拦截所有方法，直接返回 true
   if (methodMatcher == MethodMatcher.TRUE) {
      return true;
   }
   IntroductionAwareMethodMatcher introductionAwareMethodMatcher = null;
   if (methodMatcher instanceof IntroductionAwareMethodMatcher) {
      introductionAwareMethodMatcher = (IntroductionAwareMethodMatcher) methodMatcher;
   }
   Set<Class<?>> classes = new LinkedHashSet<>();
  //判断是否是代理类
   if (!Proxy.isProxyClass(targetClass)) {
      classes.add(ClassUtils.getUserClass(targetClass));
   }//将类的所有接口都加入判断，在这里宁判错，勿错过
   classes.addAll(ClassUtils.getAllInterfacesForClassAsSet(targetClass));
   //遍历所有class 中的 所有方法，只要MethodMatcher能匹配到一个就返回true
   for (Class<?> clazz : classes) {
      Method[] methods = ReflectionUtils.getAllDeclaredMethods(clazz);
      for (Method method : methods) {
         if (introductionAwareMethodMatcher != null ?
               introductionAwareMethodMatcher.matches(method, targetClass, hasIntroductions) :
               methodMatcher.matches(method, targetClass)) {
            return true;
         }
      }
   }
   return false;
}
```

在这里宁可多通过，也不要校验太严格，因为在代理类中具体方法执行的时候，还会再一次使用Pointcut进行校验。所以该方法中会获取目标类型的所有接口，判断接口中的方法，有一个符合也会返回true

### 4、Advisor 排序

当获取到目标类型上的所有Advisor后，还需要对Advisor进行排序。Advisor的顺序决定了通知方法的应用顺序。

Advisor的排序主要分为两种

1. 不同切面的排序，AbstractPointcutAdvisor实现了 Ordered 接口，根据Ordered的排序
2. 同一个切面下不同的通知方法的排序
   1. 根据通知方法在切面中的声明顺序排序
   2. 后置通知比较奇葩，根据声明顺序逆序排序，因为后置通知声明在前面的要执行，但是在列表中排序靠前的在执行的时候后置通知会后执行

接下来看下spring是怎么实现排序的

AbstractAdvisorAutoProxyCreator.sortAdvisors提供了基于Ordered的排序，由spring的AnnotationAwareOrderComparator统一处理Ordered实现类或者添加@Ordered注解类的排序

```java
protected List<Advisor> sortAdvisors(List<Advisor> advisors) {
   AnnotationAwareOrderComparator.sort(advisors);//基于Ordered排序
   return advisors;
}
```

AspectJAwareAdvisorAutoProxyCreator覆写了父类的sortAdvisors方法，在基于Ordered排序基础上提供了同一切面下不同通知之间的排序，具体排序实现委托给了PartialOrder

```java
protected List<Advisor> sortAdvisors(List<Advisor> advisors) {
   List<PartiallyComparableAdvisorHolder> partiallyComparableAdvisors = new ArrayList<>(advisors.size());
   for (Advisor element : advisors) {
      partiallyComparableAdvisors.add(
            new PartiallyComparableAdvisorHolder(element, DEFAULT_PRECEDENCE_COMPARATOR));
   }
  //排序
   List<PartiallyComparableAdvisorHolder> sorted = PartialOrder.sort(partiallyComparableAdvisors);
   if (sorted != null) {
      List<Advisor> result = new ArrayList<>(advisors.size());
      for (PartiallyComparableAdvisorHolder pcAdvisor : sorted) {
         result.add(pcAdvisor.getAdvisor());
      }
      return result;
   } else {
      return super.sortAdvisors(advisors);
   }
}
```

至此完成Advisor的查找、筛选、排序。

