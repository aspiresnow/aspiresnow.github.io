---
title: spring事务(二) 声明式事务
date: 2020-06-22 11:28:43
tags:
- spring 
categories:
- spring

---

# spring事务(二) 声明式事务

## 知识导读

- 声明式事务是对编程式事务的包装

- 声明式事务通过使用AOP来实现，注册了一个Advisor类型的对象，创建AOP代理的时候会使用该Advisor

- Advisor中切点的判断方法是是否能在目标方法上解析获取到事务配置信息 即 @Transaction

- Advisor的通知拦截器是TransactionInterceptor，在该类中会使用事务管理器 TransactionManager 在目标方法执行前开启事务获取TransactionStatus，然后调用目标方法，执行成功后使用 TransactionManager.commit(TransactionStatus),执行异常后判断异常类型执行TransactionManager.rollback(TransactionStatus)，实际上是一个环绕通知。

- 事务管理的异常回滚机制rollbackfor是在TransactionInterceptor实现的，在回滚的时候会根据事务配置来判断当前异常是该回滚还是提交

  

## 声明式事务

spring中开启声明式事务有两种方式，一种是通过xml配置，一种是通过注解开启

使用xml配置，首先开启自动代理，然后配置事务advisor

```xml
<!-- 激活自动代理功能 -->
<aop:aspectj-autoproxy/>
<aop:aspectj-autoproxy proxy-target-class="true" expose-proxy="true" />
<!--声明通知-->
<tx:advice id="txAdvice" transaction-manager="transactionManager">
    <tx:attributes>
        <tx:method name="get*" read-only="true" propagation="NOT_SUPPORTED"/>
        <tx:method name="find*" read-only="true" propagation="NOT_SUPPORTED"/>
        <tx:method name="*" propagation="REQUIRED"/>
    </tx:attributes>
</tx:advice>
<!--声明aop增强-->
<aop:config>
    <aop:pointcut expression="execution(* exam.service..*.*(..))" id="transaction"/>
    <aop:advisor advice-ref="txAdvice" pointcut-ref="transaction"/>
</aop:config>
```

使用注解就是在配置类上添加@EnableTransactionManagement注解

```java
@EnableTransactionManagement
public class config{}
```

两种启动声明式事务的方式，底层都是在spring容器中注册三个bean，通知(TransactionInterceptor)，切点(TransactionAttributeSource)、增强advisor(BeanFactoryTransactionAttributeSourceAdvisor)

```java
@Configuration
public class ProxyTransactionManagementConfiguration extends AbstractTransactionManagementConfiguration {
  //增强 advisor
   @Bean(name = TransactionManagementConfigUtils.TRANSACTION_ADVISOR_BEAN_NAME)
   @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
   public BeanFactoryTransactionAttributeSourceAdvisor transactionAdvisor() {
      BeanFactoryTransactionAttributeSourceAdvisor advisor = new BeanFactoryTransactionAttributeSourceAdvisor();
      advisor.setTransactionAttributeSource(transactionAttributeSource());
      advisor.setAdvice(transactionInterceptor());
      if (this.enableTx != null) {
         advisor.setOrder(this.enableTx.<Integer>getNumber("order"));
      }
      return advisor;
   }
  //用于解析事务属性配置，然后判断是否为空 作为切点
   @Bean
   @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
   public TransactionAttributeSource transactionAttributeSource() {
      return new AnnotationTransactionAttributeSource();
   }
  //通知
   @Bean
   @Role(BeanDefinition.ROLE_INFRASTRUCTURE)
   public TransactionInterceptor transactionInterceptor() {
      TransactionInterceptor interceptor = new TransactionInterceptor();
      interceptor.setTransactionAttributeSource(transactionAttributeSource());
      if (this.txManager != null) {
         interceptor.setTransactionManager(this.txManager);
      }
      return interceptor;
   }
}
```

在spring aop分析中已经提到过，spring会扫描spring容器中所有类型为Advisor的bean用于进行代理时增强。接下来看下BeanFactoryTransactionAttributeSourceAdvisor中的切点 Pointcut和通知TransactionInterceptor的实现逻辑

### 切点

在BeanFactoryTransactionAttributeSourceAdvisor中声明了切点，创建了TransactionAttributeSourcePointcut类型的切点

```java
private final TransactionAttributeSourcePointcut pointcut = new TransactionAttributeSourcePointcut() {
   @Override
   @Nullable
   protected TransactionAttributeSource getTransactionAttributeSource() {
      return transactionAttributeSource;
   }
};
```

接着看TransactionAttributeSourcePointcut中定义的classFilter和methodMatcher实现逻辑

- ClassFilter.TRU，ClassFilter拦截所有类

- 实现了MethodMatcher的matches方法，该方法中会调用TransactionAttributeSource解析获取目标方法和目标类上配置的事务属性，如果解析到则进行拦截增强，否则无需代理增强

```java
private ClassFilter classFilter = ClassFilter.TRUE;
//MethodMatcher
@Override
public boolean matches(Method method, Class<?> targetClass) {
  //过滤掉 spring事务的基础类
  if (TransactionalProxy.class.isAssignableFrom(targetClass) ||
      PlatformTransactionManager.class.isAssignableFrom(targetClass) ||
      PersistenceExceptionTranslator.class.isAssignableFrom(targetClass)) {
    return false;
  }
  //获取上面注册的bean  AnnotationTransactionAttributeSource
  TransactionAttributeSource tas = getTransactionAttributeSource();
//使用AnnotationTransactionAttributeSource解析解析方法上的注解@Transaction属性，如果有则需要进行事务增强
  return (tas == null || tas.getTransactionAttribute(method, targetClass) != null);
}
```

以下是TransactionAttributeSource的继承图，TransactionAttributeSource用于获取目标方法和目标类上配置的TransactionAttribute。主要逻辑由AbstractFallbackTransactionAttributeSource实现

![80e2oT](https://raw.githubusercontent.com/aspiresnow/aspiresnow.github.io/hexo/source/blog_images/2020/06/80e2oT.png)

在 AbstractFallbackTransactionAttributeSource主要调用computeTransactionAttribute解析获取TransactionAttribute，然后将结果进行了缓存。

```java
public TransactionAttribute getTransactionAttribute(Method method, @Nullable Class<?> targetClass) {
   if (method.getDeclaringClass() == Object.class) {
      return null;
   }
   //首先从缓存中获取 事务属性
   Object cacheKey = getCacheKey(method, targetClass);
   TransactionAttribute cached = this.attributeCache.get(cacheKey);
   if (cached != null) {
      if (cached == NULL_TRANSACTION_ATTRIBUTE) {
         return null;
      } else {
         return cached;
      }
   } else {
      //缓存没有信息，调用computeTransactionAttribute解析 TransactionAttribute
      TransactionAttribute txAttr = computeTransactionAttribute(method, targetClass);
      //将解析到的 TransactionAttribute 缓存起来
      if (txAttr == null) {
         this.attributeCache.put(cacheKey, NULL_TRANSACTION_ATTRIBUTE);
      } else {
         String methodIdentification = ClassUtils.getQualifiedMethodName(method, targetClass);
         if (txAttr instanceof DefaultTransactionAttribute) {
            ((DefaultTransactionAttribute) txAttr).setDescriptor(methodIdentification);
         }
         this.attributeCache.put(cacheKey, txAttr);
      }
      return txAttr;
   }
}
```

AbstractFallbackTransactionAttributeSource.computeTransactionAttribute中会首先去实现类的方法上找事务配置，找到返回。如果没有再去实现类上找事务配置，找到返回。如果都没有再去接口的方法找事务配置，找到返回。如果没有再去接口上找事务配置，找到返回。如果都找不到，返回null，当前切点不拦截目标方法

```java
protected TransactionAttribute computeTransactionAttribute(Method method, @Nullable Class<?> targetClass) {
   // Don't allow no-public methods as required.
   if (allowPublicMethodsOnly() && !Modifier.isPublic(method.getModifiers())) {
      return null;
   }
   Method specificMethod = AopUtils.getMostSpecificMethod(method, targetClass);
   //首先解析获取方法上配置的事务，如果解析到直接返回
   TransactionAttribute txAttr = findTransactionAttribute(specificMethod);
   if (txAttr != null) {
      return txAttr;
   }
  //方法上未解析到事务配置，再从类上获取事务配置，如果解析到返回
   txAttr = findTransactionAttribute(specificMethod.getDeclaringClass());
   if (txAttr != null && ClassUtils.isUserLevelMethod(method)) {
      return txAttr;
   }
   //当方法是接口的时候，先从实现类找，实现类找不到再在接口上找
   if (specificMethod != method) {
      //在接口方法上找事务属性
      txAttr = findTransactionAttribute(method);
      if (txAttr != null) {
         return txAttr;
      }
      //在接口类上找事务属性
      txAttr = findTransactionAttribute(method.getDeclaringClass());
      if (txAttr != null && ClassUtils.isUserLevelMethod(method)) {
         return txAttr;
      }
   }
   return null;
}
```

调用子类AnnotationTransactionAttributeSource的实现逻辑获取事务属性，然后接着调用TransactionAnnotationParser来解析获取@Transaction注解

```java
protected TransactionAttribute findTransactionAttribute(Class<?> clazz) {
   return determineTransactionAttribute(clazz);
}

protected TransactionAttribute findTransactionAttribute(Method method) {
   return determineTransactionAttribute(method);
}

protected TransactionAttribute determineTransactionAttribute(AnnotatedElement element) {
		for (TransactionAnnotationParser annotationParser : this.annotationParsers) {
			TransactionAttribute attr = annotationParser.parseTransactionAnnotation(element);
			if (attr != null) {
				return attr;
			}
		}
		return null;
}
```

spring中定义了TransactionAnnotationParser接口用于解析获取 @Annotation注解中的属性。

![ADPXEH](https://raw.githubusercontent.com/aspiresnow/aspiresnow.github.io/hexo/source/blog_images/2020/06/ADPXEH.png)

SpringTransactionAnnotationParser 会解析 @Transaction注解中配置的属性，然后再封装为TransactionAttribute对象返回

```java
public TransactionAttribute parseTransactionAnnotation(AnnotatedElement element) {
  //读取 @Transactional 注解上的属性
   AnnotationAttributes attributes = AnnotatedElementUtils.findMergedAnnotationAttributes(
         element, Transactional.class, false, false);
   if (attributes != null) {
     //解析注解属性
      return parseTransactionAnnotation(attributes);
   } else {
      return null;
   }
}

protected TransactionAttribute parseTransactionAnnotation(AnnotationAttributes attributes) {
   RuleBasedTransactionAttribute rbta = new RuleBasedTransactionAttribute();
   Propagation propagation = attributes.getEnum("propagation");
   rbta.setPropagationBehavior(propagation.value());
   Isolation isolation = attributes.getEnum("isolation");
   rbta.setIsolationLevel(isolation.value());
   rbta.setTimeout(attributes.getNumber("timeout").intValue());
   rbta.setReadOnly(attributes.getBoolean("readOnly"));
   rbta.setQualifier(attributes.getString("value"));

   List<RollbackRuleAttribute> rollbackRules = new ArrayList<>();
   for (Class<?> rbRule : attributes.getClassArray("rollbackFor")) {
      rollbackRules.add(new RollbackRuleAttribute(rbRule));
   }
   for (String rbRule : attributes.getStringArray("rollbackForClassName")) {
      rollbackRules.add(new RollbackRuleAttribute(rbRule));
   }
   for (Class<?> rbRule : attributes.getClassArray("noRollbackFor")) {
      rollbackRules.add(new NoRollbackRuleAttribute(rbRule));
   }
   for (String rbRule : attributes.getStringArray("noRollbackForClassName")) {
      rollbackRules.add(new NoRollbackRuleAttribute(rbRule));
   }
   rbta.setRollbackRules(rollbackRules);

   return rbta;
}
```

至此当从目标方法中解析获取到事务配置信息TransactionAttribute，则当前切点满足拦截目标方法，构建代理类的时候会将Advisor对应的通知TransactionInterceptor添加到拦截器列表中。当代理类方法执行的时候会调TransactionInterceptor的invoke方法进行代理增强。

### 通知

TransactionInterceptor实现了MethodInterceptor接口，是一个AOP中的通知类，构造参数中需要一个事务管理器和事务配置属性。

当BeanFactoryTransactionAttributeSourceAdvisor中的Pointcut满足切目标方法时，会生成代理类，将当前TransactionInterceptor添加到拦截器链中，目标方法执行的时候会调用其invoke方法。接着调用invokeWithinTransaction实现目标方法的事务管理功能

```java
public class TransactionInterceptor extends TransactionAspectSupport implements MethodInterceptor, Serializable {
   public TransactionInterceptor(PlatformTransactionManager ptm, TransactionAttributeSource tas) {
      setTransactionManager(ptm);
      setTransactionAttributeSource(tas);
   }
   @Override
   @Nullable
   public Object invoke(MethodInvocation invocation) throws Throwable {
      //获取目标类
      Class<?> targetClass = (invocation.getThis() != null ? AopUtils.getTargetClass(invocation.getThis()) : null);
      //调用父类 TransactionAspectSupport 的方法逻辑进行事务管理
      return invokeWithinTransaction(invocation.getMethod(), targetClass, invocation::proceed);
   }
}
```

调用父类TransactionAspectSupport.invokeWithinTransaction实现开启事务逻辑

1. 获取目标方法的事务配置
2. 获取spring容器中注册的事务管理器PlatformTransactionManger
3. 开启事务
4. 调用目标方法逻辑
5. 成功提交事务，异常回滚事务

```java
protected Object invokeWithinTransaction(Method method, @Nullable Class<?> targetClass,
      final InvocationCallback invocation) throws Throwable {
   //获取事务配置信息
   TransactionAttributeSource tas = getTransactionAttributeSource();
   final TransactionAttribute txAttr = (tas != null ? tas.getTransactionAttribute(method, targetClass) : null);
  //获取事务管理器
   final PlatformTransactionManager tm = determineTransactionManager(txAttr);
   final String joinpointIdentification = methodIdentification(method, targetClass, txAttr);

   if (txAttr == null || !(tm instanceof CallbackPreferringPlatformTransactionManager)) {
     //开启事务
      TransactionInfo txInfo = createTransactionIfNecessary(tm, txAttr, joinpointIdentification);
      //环绕通知
      Object retVal;
      try {
        //调用 MethodInvocation.invoke，即调用被代理对象的原有逻辑
         retVal = invocation.proceedWithInvocation();
      }
      catch (Throwable ex) {
        //执行异常，根据回滚异常配置决定是提交事务还是回滚事务
         completeTransactionAfterThrowing(txInfo, ex);
         throw ex;
      } finally {
        //完成之后清除事务信息
         cleanupTransactionInfo(txInfo);
      }
     //执行完成提交事务
      commitTransactionAfterReturning(txInfo);
      return retVal;
   } 
  //此处省略代码....
}
```

获取事务管理器，如果@Transaction中transactionManager属性声明了该方法事务指定的事务管理器，则根据beanName获取指定的TransactionManager，否则获取spring容器中默认声明的PlatformTransactionManager类型的事务管理器

```java
protected PlatformTransactionManager determineTransactionManager(@Nullable TransactionAttribute txAttr) {
   // Do not attempt to lookup tx manager if no tx attributes are set
   if (txAttr == null || this.beanFactory == null) {
      return getTransactionManager();
   }
  //如果 @Transaction中声明了transactionManager则获取指定名称的事务管理器
   String qualifier = txAttr.getQualifier();
   if (StringUtils.hasText(qualifier)) {
      return determineQualifiedTransactionManager(this.beanFactory, qualifier);
   }
   else if (StringUtils.hasText(this.transactionManagerBeanName)) {
      return determineQualifiedTransactionManager(this.beanFactory, this.transactionManagerBeanName);
   }
   else {
      PlatformTransactionManager defaultTransactionManager = getTransactionManager();
      if (defaultTransactionManager == null) {
         defaultTransactionManager = this.transactionManagerCache.get(DEFAULT_TRANSACTION_MANAGER_KEY);
         if (defaultTransactionManager == null) {
            defaultTransactionManager = this.beanFactory.getBean(PlatformTransactionManager.class);
            this.transactionManagerCache.putIfAbsent(
                  DEFAULT_TRANSACTION_MANAGER_KEY, defaultTransactionManager);
         }
      }
      return defaultTransactionManager;
   }
}
```

开启事务，其实就是调用 PlatformTransactionManager.getTransaction开启事务，获取TransactionStatus，然后再封装到TransactionInfo中返回

```java
protected TransactionInfo createTransactionIfNecessary(@Nullable PlatformTransactionManager tm,
      @Nullable TransactionAttribute txAttr, final String joinpointIdentification) {

   // If no name specified, apply method identification as transaction name.
   if (txAttr != null && txAttr.getName() == null) {
      txAttr = new DelegatingTransactionAttribute(txAttr) {
         @Override
         public String getName() {
            return joinpointIdentification;
         }
      };
   }
  //调用PlatformTransactionManager.getTransaction开启事务，并返回事务状态TransactionStatus
   TransactionStatus status = null;
   if (txAttr != null) {
      if (tm != null) {
         status = tm.getTransaction(txAttr);
      } else {
        //无需开启
      }
   }
   return prepareTransactionInfo(tm, txAttr, joinpointIdentification, status);
}
```

提交事务，调用TransactionManager.commit(TransactionStatus)进行事务提交

```java
protected void commitTransactionAfterReturning(@Nullable TransactionInfo txInfo) {
   if (txInfo != null && txInfo.getTransactionStatus() != null) {
      //调用 TransactionManager.commit 提交事务
      txInfo.getTransactionManager().commit(txInfo.getTransactionStatus());
   }
}
```

异常事务处理，在这里多一步处理，需要判断事务异常配置，如果当前异常需要回滚则调用TransactionManager.rollback(TransactionStatus)进行事务回滚。如果当前异常无需回滚则调用TransactionManager.commit(TransactionStatus)进行事务提交

```java
protected void completeTransactionAfterThrowing(@Nullable TransactionInfo txInfo, Throwable ex) {
   if (txInfo != null && txInfo.getTransactionStatus() != null) {
      //判断当前异常是否需要回滚，如果需要，调用 TransactionManager.rollback回滚事务
      if (txInfo.transactionAttribute != null && txInfo.transactionAttribute.rollbackOn(ex)) {
         try {
            txInfo.getTransactionManager().rollback(txInfo.getTransactionStatus());
         }
         //此处省略代码....
      } else {
        //如果当前事务无需回滚，调用 TransactionManager.commit 提交事务
         try {
            txInfo.getTransactionManager().commit(txInfo.getTransactionStatus());
         }
         //此处省略代码....
      }
   }
}
```

判断回滚异常的默认实现，默认只会滚RuntimeException类型的异常

```java
@Override
public boolean rollbackOn(Throwable ex) {
   return (ex instanceof RuntimeException || ex instanceof Error);
}
```

至此，spring通过AOP环绕通知实现了对编程式事务管理的封装，通过声明式实现了自动事务管理功能。

## 常见问题

### 一、在同一类中一个调用本类中另一个有事务的方法,事务是无效

第一步：首先在spring的配置文件中加入以下配置

```xml
<aop:aspectj-autoproxy proxy-target-class="true" expose-proxy="true" />
```

第二步：将之前使用普通调用的方法,换成使用代理调用

```java
((TestService)AopContext.currentProxy()).testTransactional2();
```

或者直接使用手动回滚

```java
TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
```

### 二、spring声明式事务管理默认对非检查型异常和运行时异常进行事务回滚，而对检查型异常则不进行回滚操作

1 让checked例外也回滚：在整个方法前加上 @Transactional(rollbackFor=Exception.class)

 2 让unchecked例外不回滚： @Transactional(notRollbackFor=RunTimeException.class)

 3 不需要事务管理的(只查询的)方法：@Transactional(propagation=Propagation.NOT_SUPPORTED)

