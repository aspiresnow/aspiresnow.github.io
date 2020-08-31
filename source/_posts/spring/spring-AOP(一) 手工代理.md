---
title: spring-AOP(一)
date: 2020-06-15
tags:
- spring 
categories:
- spring

---

# spring-AOP(一) 手动代理

spring的设计原理是构造一个个原子功能，然后不断的通过设计模式在外围进行包装、组合调用，最后实现复杂的逻辑功能。

## 知识导读

- 了解Aop联盟定义的几个概念，连接点、通知、拦截、切点、增强
- ProxyFactory 定义了创建代理对象的工厂方法，不过该类主要用于提供代理配置
- AopProxy 定义创建代理对象的接口，实现类有 jdk代理 和 cglib代理
- 代理的本质就是对目标方法执行的拦截增强
- 创建代理最主要是提供 被代理对象 和 增强列表 AdvisorList
- **Advisor封装了通知和切点，实质就是封装了一个可以决定在什么类的什么方法上进行增强的通知**
- 代理的最终目的就是在方法的执行前后添加逻辑，最终构建 **ReflectiveMethodInvocation**，创建代理类的目的就是为了实现选择性的对目标对象方法的拦截，然后将方法调用封装为ReflectiveMethodInvocation
- Pointcut提供了怎么筛选拦截哪些对象的哪些方法
- 切面是通知的载体，通知是个方法，切面就是定义这些方法的对象。拦截器将这些通知按照顺序串成一个链

## AOP联盟和Spring扩展

AOP的实质**对连接点的增强**，一般通俗点讲是对对**方法执行**的**拦截增强**
AOP联盟定义了AOP的规范接口，声明了两个最基础的接口，连接点 和 增强 。

### 连接点 Joinpoint

```java
public interface Joinpoint {
	 //连接点的执行
   Object proceed() throws Throwable;
  //一般用于返回被代理对象
   Object getThis();
  //一般用于返回目标方法的Method对象
   AccessibleObject getStaticPart();
}
```

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/fZwewP.jpg)

Joinpoint(连接点) 代表一个对象可以切入的地方，一般来说就是一个方法的执行，MehtodInvocation将方法的调用过程进行了封装。spring实现扩展了MethodInvocation，在ReflectiveMethodInvocation中既实现了方法调用的封装，又定义了拦截器链，用于在方法执行过程中进行拦截增强。

### 通知 Advice

```java
public interface Advice {

}
```

AOP联盟声明了通知的接口，用于标记通知类型，最主要的接口实现是拦截器Interceptor

```java
public interface Interceptor extends Advice {

}
```

```java
@FunctionalInterface
public interface MethodInterceptor extends Interceptor {
  //定义了对 方法调用 进行拦截的接口
   Object invoke(MethodInvocation invocation) throws Throwable;
}
```
在MethodInterceptor接口中声明了invoke方法，需要一个MethodInvocation对象参数。用于对方法调用进行拦截，然后执行增强逻辑，在合适的时机回调MethodInvocation，实现增强的功能

spring对MethodInterceptor接口进行了具体实现，例如提供了前置通知、后置通知、最终通知、异常通知、环绕通知的实现类。

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/BfRb68.jpg)

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/d9juQF.jpg)

### 切点 Pointcut

Pointcut是spring定义的一个接口，用于过滤目标类和匹配目标方法(连接点)

```java
public interface Pointcut {
   //用于过滤目标类
   ClassFilter getClassFilter();
   //用于匹配目标方法
   MethodMatcher getMethodMatcher();
  
   Pointcut TRUE = TruePointcut.INSTANCE;
}
```

Pointcut 的具体实现，spring中Pointcut是很重的一块逻辑，可以单独出一篇文档

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/NscLC2.jpg)

### 增强 Advisor

spring中定义的增强类，用于封装一个Pointcut和一个Advice，实质就是封装了一个可以决定在什么类的什么方法上应用的通知

```java
public interface Advisor {
   Advice EMPTY_ADVICE = new Advice() {};
   //封装的通知
   Advice getAdvice();
   boolean isPerInstance();
}
```

```java
public interface PointcutAdvisor extends Advisor {
   //切点，用于匹配连接点，是否应用Advice通知
   Pointcut getPointcut();
}
```

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/bgWnaP.jpg)

## 工厂方式创建代理对象

### ProxyFactory

通过ProxyFactory创建代理对象，需要配置以下信息

1. 被代理对象
2. 增强Advisor列表
3. 被代理接口(非必须)
4. 其他一些非必须配置(非必须)

下图是ProxyFactory的继承关系图，通过看各个层级的字段，可以看出ProxyFactory主要定义的是一些创建代理的配置信息。

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/dXcJii.jpg)

### AopProxy

已知的可以创建代理对象的方式

1. 使用jdk Proxy，需要创建一个InvocationHandler的实现类，调用代理对象的方法都会去调用InvocationHandler的实现类的invoke方法，所有的拦截和增强在invoke方法中做
2. 使用cglib的Enhancer，需要创建一批MethodInterceptor的实现类，调用代理对象所有方法都会去调用MethodInterceptor实现类的intercept方法，所有的拦截和增强都在intercept方法中做

spring中定义了一个AopProxy接口，用于获取代理类，实现类是JdkProxy和cglibProxy，ProxyFactory提供了创建AopProxy的配置信息，创建代理类对象的工作交由AopProxy的实现类实现。

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/X2TMay.jpg)

### 通过ProxyFactory配置创建AopProxy实现

spring中定义了ProxyFactory用于创建代理对象，下面是创建代理对象的一个demo。

```java
ProxyFactory proxyFactory = new ProxyFactory();
proxyFactory.setTargetSource(targetSource);//设置被代理对象
factory.setInterfaces(IUserService.class);//设置要代理的接口
proxyFactory.setProxyTargetClass(true);//设置使用cglib创建代理
proxyFactory.setExposeProxy(true);//设置是否暴露代理类
Advisor[] advisors = buildAdvisors(beanName, specificInterceptors);
proxyFactory.addAdvisors(advisors);//设置目标类的增强 Advisor列表
return proxyFactory.getProxy(getProxyClassLoader());//创建代理类对象
```

调用ProxyFactory的getProxy创建代理类对象，首先会创建一个AopProxy对象，然后调用AopProxy的getProxy方法获取代理类对象，在整个创建代理类过程中，ProxyFactory用于提供配置

```java
public Object getProxy(@Nullable ClassLoader classLoader) {
   return createAopProxy().getProxy(classLoader);
}
```

调用父类ProxyCreatorSupport中的createAopProxy创建AopProxy。

```java
protected final synchronized AopProxy createAopProxy() {
   if (!this.active) {
      activate();
   }
   return getAopProxyFactory().createAopProxy(this);
}
```

在AopProxyFactory的createAopProxy创建了AopProxy的具体实现，会通过ProxyFactory中提供的配置来选择使用jdk代理还是cglib代理

注意，cglib也可以创建基于接口的代理

```java
public AopProxy createAopProxy(AdvisedSupport config) throws AopConfigException {
   if (config.isOptimize() || config.isProxyTargetClass() || hasNoUserSuppliedProxyInterfaces(config)) {
      Class<?> targetClass = config.getTargetClass();
      if (targetClass == null) {
         throw new AopConfigException("TargetSource cannot determine target class: " +
               "Either an interface or a target is required for proxy creation.");
      }
      if (targetClass.isInterface() || Proxy.isProxyClass(targetClass)) {
         return new JdkDynamicAopProxy(config);
      }
      return new ObjenesisCglibAopProxy(config);
   }
   else {
      return new JdkDynamicAopProxy(config);
   }
}
```

### 通过AopProxy创建代理类对象

创建完AopProxy之后，调用AopProxy实现类的getProxy就可以创建代理类，和代理类对象。

#### jdk代理

首先来分析spring是如何实现jdk代理的，在JdkDynamicAopProxy中getProxy中通过调用Proxy的api创建代理类对象

```java
@Override
public Object getProxy(@Nullable ClassLoader classLoader) {
  //获取ProxyFactory提供的配置，接口
  Class<?>[] proxiedInterfaces = AopProxyUtils.completeProxiedInterfaces(this.advised, true);
  findDefinedEqualsAndHashCodeMethods(proxiedInterfaces);
  //调用Proxy的api创建代理类对象。
  return Proxy.newProxyInstance(classLoader, proxiedInterfaces, this);
}
```

由于JdkDynamicAopProxy自己本身实现了InvocationHandler接口，所以在创建代理对象的时候传递的是this

#### cglib代理

jdk代理比较简单，接下来看下CglibAopProxy是如何通过cglib来创建代理类对象的

```java
@Override
public Object getProxy(@Nullable ClassLoader classLoader) {
   try {
      //获取ProxyFactory配置的目标类型
      Class<?> rootClass = this.advised.getTargetClass();
      Class<?> proxySuperClass = rootClass;
      //如果当前的类型已经是cglib创建的代理类，使用代理类的父类
      if (ClassUtils.isCglibProxyClass(rootClass)) {
         proxySuperClass = rootClass.getSuperclass();
         Class<?>[] additionalInterfaces = rootClass.getInterfaces();
         for (Class<?> additionalInterface : additionalInterfaces) {
            this.advised.addInterface(additionalInterface);
         }
      }
      //检查下方法是否是final修饰和 private
      validateClassIfNecessary(proxySuperClass, classLoader);
     //使用cglib的Enhancer创建代理
      Enhancer enhancer = createEnhancer();
      if (classLoader != null) {
         enhancer.setClassLoader(classLoader);
         if (classLoader instanceof SmartClassLoader &&
               ((SmartClassLoader) classLoader).isClassReloadable(proxySuperClass)) {
            enhancer.setUseCache(false);
         }
      }
      enhancer.setSuperclass(proxySuperClass);//设置父类
      enhancer.setInterfaces(AopProxyUtils.completeProxiedInterfaces(this.advised));
      enhancer.setNamingPolicy(SpringNamingPolicy.INSTANCE);
      enhancer.setStrategy(new ClassLoaderAwareUndeclaredThrowableStrategy(classLoader));
      //最重要的一步，组装cglib需要的拦截器实现
      Callback[] callbacks = getCallbacks(rootClass);
      Class<?>[] types = new Class<?>[callbacks.length];
      for (int x = 0; x < types.length; x++) {
         types[x] = callbacks[x].getClass();
      }
      //设置拦截器过滤器，用于指定什么方法应用什么拦截器
      enhancer.setCallbackFilter(new ProxyCallbackFilter(
            this.advised.getConfigurationOnlyCopy(), this.fixedInterceptorMap, this.fixedInterceptorOffset));
      enhancer.setCallbackTypes(types);
      // enhancer创建代理
      return createProxyClassAndInstance(enhancer, callbacks);
   }
   catch (CodeGenerationException | IllegalArgumentException ex) {
     //此处省略代码....
   }
   catch (Throwable ex) {
      //此处省略代码....
   }
}
```

通过以上逻辑，spring就完成了代理类的创建，接下来对代理类的方法调用都会去调用InvocationHandler的invoke方法或者Callback的intercept方法。

## 代理类的方法调用

### jdk代理的方法调用

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/zsq7Kv.jpg)

JdkDynamicAopProxy实现了InvocationHandler的invoke方法，代理类对象所有方法的执行都会通过invoke方法来调用

1. 根据Pointcut筛选应用目标方法的Advisor，将Advisor中的Advice封装为增强目标方法的拦截器链

2. 基于拦截器链封装MethodInvocation实现类对象，方法的调用和拦截增强全由MethodInvocation实现，

注意每次目标方法执行都会新建一个MethodInvocation对象

```java
@Override
public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
   //用于记录ThreadLocal中之前的代理类对象
   Object oldProxy = null;
   boolean setProxyContext = false;
   //被代理对象
   TargetSource targetSource = this.advised.targetSource;
   Object target = null;
   try {
     //此处省略代码....
      Object retVal;
		  //判断如果要暴露代理类对象，如果是将代理对象放入ThreadLocal，通过AopContext.currentProxy获取
     //同时要记录下 ThreadLocal中之前存储的代理类对象，方法执行完毕后要重置回去
      if (this.advised.exposeProxy) {
         oldProxy = AopContext.setCurrentProxy(proxy);
         setProxyContext = true;
      }
      target = targetSource.getTarget();
      Class<?> targetClass = (target != null ? target.getClass() : null);
      //最重要的一步 封装获取拦截器链
      List<Object> chain = this.advised.getInterceptorsAndDynamicInterceptionAdvice(method, targetClass);
      //如果拦截器链为空，直接反射调用被代理对象的方法
      if (chain.isEmpty()) {
         Object[] argsToUse = AopProxyUtils.adaptArgumentsIfNecessary(method, args);
         retVal = AopUtils.invokeJoinpointUsingReflection(target, method, argsToUse);
      }else {
         //如果存在拦截器链，构造方法调用的封装对象MethodInvocation，被代理对象方法的调用以及拦截器的增强封装都通过该类实现，每次都新建ReflectiveMethodInvocation对象，这个对象中有currentInterceptorIndex，避免污染
         MethodInvocation invocation =
               new ReflectiveMethodInvocation(proxy, target, method, args, targetClass, chain);
         retVal = invocation.proceed();
      }
      //此处省略代码....
      return retVal;
   }
   finally {
      if (target != null && !targetSource.isStatic()) {
         // Must have come from TargetSource.
         targetSource.releaseTarget(target);
      }
      if (setProxyContext) {
         // 方法执行完毕后重置ThreadLocal中的代理类对象
         AopContext.setCurrentProxy(oldProxy);
      }
   }
}
```

来看下spring中是如何筛选目标方法的拦截器链的，在getInterceptorsAndDynamicInterceptionAdvice会首先去获取缓存中的拦截器链，如果没有，再进行筛选解析，感觉这里还是直接new一个list，然后将cached放进去，避免后续流程修改列表

```java
public List<Object> getInterceptorsAndDynamicInterceptionAdvice(Method method, @Nullable Class<?> targetClass) {
  //使用方法名作为缓存key，将拦截器链缓存起来，避免重复解析
   MethodCacheKey cacheKey = new MethodCacheKey(method);
   List<Object> cached = this.methodCache.get(cacheKey);
   if (cached == null) {
      cached = this.advisorChainFactory.getInterceptorsAndDynamicInterceptionAdvice(
            this, method, targetClass);
      this.methodCache.put(cacheKey, cached);
   }
   return cached;
}
```

通过DefaultAdvisorChainFactory构建拦截器链，主要就是通过Advisor中的Pointcut的ClassFilter和MethodMatcher来筛选能够增强目标方法的Advisor，然后封装为拦截器MethodInterceptor对象，组装成拦截器链返回

```java
@Override
public List<Object> getInterceptorsAndDynamicInterceptionAdvice(
      Advised config, Method method, @Nullable Class<?> targetClass) {
   AdvisorAdapterRegistry registry = GlobalAdvisorAdapterRegistry.getInstance();
   Advisor[] advisors = config.getAdvisors();//获取配置中的Advisor列表
   List<Object> interceptorList = new ArrayList<>(advisors.length);
   Class<?> actualClass = (targetClass != null ? targetClass : method.getDeclaringClass());
   Boolean hasIntroductions = null;
	//遍历Advisor，筛选能够增强目标方法的Advisor，并封装为拦截器链返回
   for (Advisor advisor : advisors) {
     //如果是PointcutAdvisor，判断Advisor的Pointcut是否拦截本方法
      if (advisor instanceof PointcutAdvisor) {
         PointcutAdvisor pointcutAdvisor = (PointcutAdvisor) advisor;
        //先通过ClassFilter判断是否拦截目标类
         if (config.isPreFiltered() || pointcutAdvisor.getPointcut().getClassFilter().matches(actualClass)) {
            MethodMatcher mm = pointcutAdvisor.getPointcut().getMethodMatcher();
            boolean match;
           //再通过MethodMatcher判断是否拦截目标方法
            if (mm instanceof IntroductionAwareMethodMatcher) {
               if (hasIntroductions == null) {
                  hasIntroductions = hasMatchingIntroductions(advisors, actualClass);
               }
               match = ((IntroductionAwareMethodMatcher) mm).matches(method, actualClass, hasIntroductions);
            }
            else {
               match = mm.matches(method, actualClass);
            }
            if (match) {
               MethodInterceptor[] interceptors = registry.getInterceptors(advisor);
              //如果是要根据运行时参数进行方法校验，需要封装拦截器，将methodMatcher传下去，用于执行时判断参数
               if (mm.isRuntime()) {
                  for (MethodInterceptor interceptor : interceptors) {
                     interceptorList.add(new InterceptorAndDynamicMethodMatcher(interceptor, mm));
                  }
               }else {
                  interceptorList.addAll(Arrays.asList(interceptors));
               }
            }
         }
      }//引介增强，作用范围是类，只需判断是否拦截目标类就行
      else if (advisor instanceof IntroductionAdvisor) {
         IntroductionAdvisor ia = (IntroductionAdvisor) advisor;
         if (config.isPreFiltered() || ia.getClassFilter().matches(actualClass)) {
            Interceptor[] interceptors = registry.getInterceptors(advisor);
            interceptorList.addAll(Arrays.asList(interceptors));
         }
      }else {//其他类型Advisor，不需要过滤，默认拦截所有方法
         Interceptor[] interceptors = registry.getInterceptors(advisor);
         interceptorList.addAll(Arrays.asList(interceptors));
      }
   }
   return interceptorList;
}
```

获取到目标方法的拦截器链之后，接下来构建MethodInvocation对象，调用MethodInvocation的proceed方法。在MethodInvocation中会在目标方法执行前后执行拦截器链中的增强方法，然后在合适的时机再回调目标方法，实现代理的逻辑。

通过ReflectiveMethodInvocation的构造器可以看出，该对象就是对目标方法调用和拦截器链的封装

```java
//构造器
protected ReflectiveMethodInvocation(
			Object proxy, @Nullable Object target, Method method, @Nullable Object[] arguments,
			@Nullable Class<?> targetClass, List<Object> interceptorsAndDynamicMethodMatchers) {
		this.proxy = proxy;//代理类对象
		this.target = target;//被代理对象
		this.targetClass = targetClass;//被代理对象类型
		this.method = BridgeMethodResolver.findBridgedMethod(method);//目标方法
		this.arguments = AopProxyUtils.adaptArgumentsIfNecessary(method, arguments);//方法参数
		this.interceptorsAndDynamicMethodMatchers = interceptorsAndDynamicMethodMatchers;//拦截器链
}
```

再来看如何在proceed方法完成对方法的增强，在该方法中会遍历执行拦截器链中的拦截方法，所有拦截器都执行完毕后再调用被代理类的目标方法。拦截器链是在代理类的方法中传入的，而且是缓存过的共享对象，这里避免修改该链，使用currentInterceptorIndex来记录链的执行位置。其实这块是可以进行优化的

```java
private int currentInterceptorIndex = -1;//记录拦截器链执行第几个拦截器

public Object proceed() throws Throwable {
   // 拦截器链遍历完毕后，调用目标方法
   if (this.currentInterceptorIndex == this.interceptorsAndDynamicMethodMatchers.size() - 1) {
      return invokeJoinpoint();
   }
	 //遍历获取下一个拦截器
   Object interceptorOrInterceptionAdvice =
         this.interceptorsAndDynamicMethodMatchers.get(++this.currentInterceptorIndex);
  //如果是动态执行过程中拦截，需要根据参数来判断是否需要对目标方法进行拦截增强
   if (interceptorOrInterceptionAdvice instanceof InterceptorAndDynamicMethodMatcher) {
      InterceptorAndDynamicMethodMatcher dm =
            (InterceptorAndDynamicMethodMatcher) interceptorOrInterceptionAdvice;
      Class<?> targetClass = (this.targetClass != null ? this.targetClass : this.method.getDeclaringClass());
     //通过参数判断是否需要增强，如果需要直接调用拦截器的invoke方法，并把当前MethodInvocation传递过来，以便方法拦截逻辑执行后再次调回来
      if (dm.methodMatcher.matches(this.method, targetClass, this.arguments)) {
         return dm.interceptor.invoke(this);
      } else {
        //如果不进行拦截，递归，重新执行下一个拦截器.
         return proceed();
      }
   } else {
     //静态拦截器，直接调用拦截器对方法进行增强
      return ((MethodInterceptor) interceptorOrInterceptionAdvice).invoke(this);
   }
}
```

ReflectiveMethodInvocation中，在执行完拦截器链中所有的拦截器逻辑之后，会调用被代理对象的目标方法，默认是通过反射调用

```java
@Nullable
protected Object invokeJoinpoint() throws Throwable {
   return AopUtils.invokeJoinpointUsingReflection(this.target, this.method, this.arguments);
}
```

CglibMethodInvocation中覆写了ReflectiveMethodInvocation的invokeJoinpoint方法，会通过cglib的MethodProxy进行调用,避免反射

```java
@Override
protected Object invokeJoinpoint() throws Throwable {
   if (this.methodProxy != null) {
      return this.methodProxy.invoke(this.target, this.arguments);
   } else {
      return super.invokeJoinpoint();
   }
}
```

分析到现在，AOP剩下的功能就是要看Spring中定义的几种通知类型是如何在拦截器中进行调用的。

### 拦截器中通知方法的执行

spring中对通知advice和拦截器MethodInterceptor的继承实现由点乱，不太明白为什么要这样做，不如分开

在拦截器中可以方便的在目标方法执行前后添加逻辑，很简单。在使用@Aspect的切面的时候，会调用@Aspect注册的bean中的方法通知。这里重点看下@Aspect是如何实现的

#### 前置通知

首先来看下前置通知拦截器中如何调用前置通知。在invoke方法中先调用通知，然后再回调MethodInvocation目标方法

```java
public class MethodBeforeAdviceInterceptor implements MethodInterceptor, BeforeAdvice, Serializable {
   //包装了一个前置通知
   private final MethodBeforeAdvice advice;
   public MethodBeforeAdviceInterceptor(MethodBeforeAdvice advice) {
      this.advice = advice;
   }
   @Override
   public Object invoke(MethodInvocation mi) throws Throwable {
      //调用前置通知方法
      this.advice.before(mi.getMethod(), mi.getArguments(), mi.getThis());、
      //通知方法调用完毕之后，回调 连接点的方法执行
      return mi.proceed();
   }

}
```

AspectJMethodBeforeAdvice实现了MethodBeforeAdvice

```java
public class AspectJMethodBeforeAdvice extends AbstractAspectJAdvice implements MethodBeforeAdvice, Serializable {

   public AspectJMethodBeforeAdvice(
         Method aspectJBeforeAdviceMethod, AspectJExpressionPointcut pointcut, AspectInstanceFactory aif) {
      super(aspectJBeforeAdviceMethod, pointcut, aif);
   }

   @Override
   public void before(Method method, Object[] args, @Nullable Object target) throws Throwable {
     //调用 @aspect 切面中声明的方法
      invokeAdviceMethod(getJoinPointMatch(), null, null);
   }
}
```

在AbstractAspectJAdvice定义了切面方法调用过程

```java
protected Object invokeAdviceMethod(JoinPoint jp, @Nullable JoinPointMatch jpMatch,
      @Nullable Object returnValue, @Nullable Throwable t) throws Throwable {
   //获取方法参数，反射调用通知方法
   return invokeAdviceMethodWithGivenArgs(argBinding(jp, jpMatch, returnValue, t));
}
```

通知方法反射调用，完成前置通知的调用

```java
protected Object invokeAdviceMethodWithGivenArgs(Object[] args) throws Throwable {
   Object[] actualArgs = args;
   if (this.aspectJAdviceMethod.getParameterCount() == 0) {
      actualArgs = null;
   }
   try {
      ReflectionUtils.makeAccessible(this.aspectJAdviceMethod);
      //通知方法反射调用，对象是@aspect注册的bean
      return this.aspectJAdviceMethod.invoke(this.aspectInstanceFactory.getAspectInstance(), actualArgs);
   }
   catch (IllegalArgumentException ex) {
      //...
   }
}
```

#### 环绕通知

看完了前置通知，后置通知、异常通知基本都一样，这里看下环绕通知，环绕通知实现比较复杂

环绕通知直接调用了通知方法，在这里没有再回调目标方法的执行，因为环绕通知对目标方法的执行写在通知方法内部，接下来看环绕通知是如何完成既完成对目标方法的调用又完成剩余通知的执行

```java
public class AspectJAroundAdvice extends AbstractAspectJAdvice implements MethodInterceptor{
    @Override
    public Object invoke(MethodInvocation mi) throws Throwable {
       if (!(mi instanceof ProxyMethodInvocation)) {
        //...
       }
       ProxyMethodInvocation pmi = (ProxyMethodInvocation) mi;
       ProceedingJoinPoint pjp = lazyGetProceedingJoinPoint(pmi);
       JoinPointMatch jpm = getJoinPointMatch(pmi);
       //调用通知方法
       return invokeAdviceMethod(pjp, jpm, null, null);
    }
}
```

lazyGetProceedingJoinPoint返回了一个ProceedingJoinPoint，封装了原始的MethodInvocation对象

```java
protected ProceedingJoinPoint lazyGetProceedingJoinPoint(ProxyMethodInvocation rmi) {
   return new MethodInvocationProceedingJoinPoint(rmi);
}
```

接下来通知方法的调用跟前置通知一样，只不过是将ProceedingJoinPoint作为参数传递给了通知方法

```java
@Around("test()")
public Object aroundTest(ProceedingJoinPoint p) {
    System.out.println("around before");
    Object result = null;
    try {
        //调用原始方法
        result = p.proceed();
    } catch (Throwable e) {
    }
    System.out.println("around after");
    return result;
}
```

调用p.proceed() ，在 MethodInvocationProceedingJoinPoint 会将原始的 MethodInvocation克隆一份，会将剩余拦截器链和下标复制下来，然后重新调用 proceed方法

```java
@Override
public Object proceed() throws Throwable {
   return this.methodInvocation.invocableClone().proceed();
}
```

ReflectiveMethodInvocation进行深克隆

```java
@Override
public MethodInvocation invocableClone() {
   Object[] cloneArguments = this.arguments;
   if (this.arguments.length > 0) {
      // Build an independent copy of the arguments array.
      cloneArguments = new Object[this.arguments.length];
      System.arraycopy(this.arguments, 0, cloneArguments, 0, this.arguments.length);
   }
   return invocableClone(cloneArguments);
}
```

```java
@Override
public MethodInvocation invocableClone(Object... arguments) {
   ReflectiveMethodInvocation clone = (ReflectiveMethodInvocation) clone();
   clone.arguments = arguments;
   return clone;
}
```