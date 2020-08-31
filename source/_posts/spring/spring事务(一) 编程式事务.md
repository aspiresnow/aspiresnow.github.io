---
title: spring事务(一) 编程式事务
date: 2020-06-22 11:28:43
tags:
- spring 
categories:
- spring

---

# spring事务(一) 编程式事务

## 知识导读

- 本地事务(autocommit=false)-----编程式事务-----声明式事务
- spring对事务对象的封装其实就是封装了一个connection，开启事务的本质的将connection的autocommit=false，然后使用connection进行数据库操作，最后commit或者rollback
- spring事务实现的关键是保证开启事务的connection和执行数据库操作的connection是同一个，所以两者操作connection都要通过TransactionSynchronizationManager去获取和存储，TransactionSynchronizationManager会将connection保存到ThreadLocal中，保证同一线程中connection共享。
- TransactionSynchronizationManager获取connection时用的key是DataSource对象，所以要保证sql执行和事务用的是同一个DataSource
- spring事务的connection和配置信息都会存放到ThreadLocal中，在一个事务中开启新的线程，会导致新线程中sql执行丧失事务控制
- spring中事务的隔离级别都是基于数据库实现的、timeout是在sql执行的时候判断，所以在事务方法中的timeout配置只会作用在最后一个sql语句处，余下的方法逻辑无法控制
- 事务的挂起本质就是将开启事务的connection从ThreadLocal移除，然后重新获取connection
- 事务的恢复本质就是将挂起事务的connection重新放入ThreadLocal中
- spring的传播行为定义了在spring中多个事务如何共存，每次执行无论传播行为是什么都会返回一个新的事务状态TransactionStatus对象，不同的传播行为会导致当前运行在不同的事务上下文中，事务运行在不同的上下文，在事务提交和回滚的时候操作不同，主要有以下4中情况
  - 挂起事务然后无事务运行(newTransaction=false): 提交和回滚都无需操作
  - 新开启事务(newTransaction=true):提交commit 回滚 rollback
  - 在当前事务中运行(newTransaction=false):提交不进行任何操作，回滚标记rollbacOnly=true然后不进行操作
  - 嵌套事务，创建保存点(hasSavePoint&newTransaction=false):提交删除保存点，回滚则回滚到保存点
- 可以通过TransactionSynchronizationManager的registerSynchronization方法添加监听事务提交前、提交后、回滚前、回滚后、完成前、完成后的事件。

## spring事务管理

### 事务管理器

spring中 PlatformTransactionManager 接口是spring事务管理器的根接口，定义了事务的操作行为：开启事务、提交事务、回滚事务

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/y2etvp.jpg)

```java
public interface PlatformTransactionManager {
   //开启事务，返回事务的封装对象 TransactionStatus
   TransactionStatus getTransaction(@Nullable TransactionDefinition definition)
         throws TransactionException;
   //提交该事务
      //如果事务标记回滚rollbackOnly=true，则执行回滚。
      //如果事务是一个新事务，则调用connection.commit提交事务
      //如果事务包含 保存点，则删除保存点
      //如果事务不是一个新事务，运行在外层事务中则忽略提交，以便适当地参与周围的事务。
      //如果前一个事务已经挂起，那么在提交新事务之后恢复前一个事务。
   void commit(TransactionStatus status) throws TransactionException;
   //执行给定事务的回滚。
       //如果事务包含 保存点，则回滚到保存点
       //如果事务是新事务，调用connection.rollback回滚事务
       //如果事务不是新事务，运行在外层事务则设置rollbackOnly=true
       //如果前一个事务已经挂起，那么在回滚新事务之后恢复前一个事务。
   void rollback(TransactionStatus status) throws TransactionException;
}
```

spring事务管理的整体实现由抽象类 AbstractPlatformTransactionManager 实现。在下面的源码分析中会看到。

开启事务的参数是一个TransactionDefinition对象，该类封装了事务的配置属性，包括传播行为、超时配置、回滚异常、隔离级别等信息。事务开启后返回TransactionStatus对象，提交和回滚都是操作该对象

子类如DataSourceTransactionManager主要负责实现具体事务对象(connection)的管理，如获取、保存同步、开启事务、提交、回滚等操作。

### 事务状态

spring中TransactionStatus类用于封装事务的状态。spring中事务的开启、提交、回滚都是通过操作该对象实现

- completed:标识事务是否已完成结束
- rollbackOnly:标识事务需要回滚，在非独立新开启事务中用于回滚标记，在事务提交时的时候判断该值进行回滚
- newTransaction :标识事务是否是一个独立新开启的事务或者运行在外层事务或者是否是嵌套事务

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/Mn5DHV.jpg)

spring中使用TransactionStatus的实现类DefaultTransactionStatus，在这个类中封装了两个最重要的属性值

- transaction: 事务对象，一般返回的是一个包装了connection的对象
- suspendedResources: 挂起对的事务对象，包含被挂起的connection对象和被挂起的事务配置
- 声明式事务的配置信息

## 编程式开启事务

spring中定义了一个TransactionTemplate类，用于编程式事务执行数据库操作

TransactionTemplate的execute方法中，通过transactionManager开启一个事务并返回TransactionStatus，然后通过TransactionCallback执行实际的数据库操作，执行完毕后调用transactionManager提交事务，如果发生异常则调用transactionManager回滚事务

```java
public <T> T execute(TransactionCallback<T> action) throws TransactionException {
   Assert.state(this.transactionManager != null, "No PlatformTransactionManager set");
   if (this.transactionManager instanceof CallbackPreferringPlatformTransactionManager) {
      return ((CallbackPreferringPlatformTransactionManager) this.transactionManager).execute(this, action);
   }else {
     //开启事务，并返回封装事务的TransactionStatus对象
      TransactionStatus status = this.transactionManager.getTransaction(this);
      T result;
      try {
        //执行sql操作
         result = action.doInTransaction(status);
      }
      catch (RuntimeException | Error ex) {
         //sql操作异常进行事务回滚
         rollbackOnException(status, ex);
         throw ex;
      }
      catch (Throwable ex) {
        //sql操作异常进行事务回滚
         rollbackOnException(status, ex);
         throw new UndeclaredThrowableException(ex, "TransactionCallback threw undeclared checked exception");
      }
     //sql执行成功 提交事务
      this.transactionManager.commit(status);
      return result;
   }
}
```

### 开启事务

AbstractPlatformTransactionManager实现了事务管理器的getTransaction，在该方法中完成了事务的开启和事务传播行为的处理。

1. 通过子类实现的doGetTransaction获取一个transaction事务对象，类型是Object的，可想而知兼容不好处理啊，但是在这里也做了取巧动作，虽然返回的是Object类型，但是在父类中不会对该事务对象进行任何操作处理，所有关于事务对象的操作都交由子类覆写实现。比如isExistingTransaction(判断是否已存在事务)、doBegin(开启事务)。我们先不考虑子类的具体实现，首先看事务处理的整体逻辑

2. 获取到事务对象后，通过子类覆写逻辑判断如果已经开启事务(是否有个autoCommit=false的connection)，则根据事务的传播行为判断多事务共存的情形，然后返回TransactionStatus。

3. 如果当前还未开启事务，则根据事务传播行为判断是否需要开启事务，如果需要则调用子类覆写逻辑 doBegin方法，将事务对象transaction传递下去开启事务，然后封装好TransactionStatus对象返回

```java
@Override
public final TransactionStatus getTransaction(@Nullable TransactionDefinition definition) throws TransactionException {
  //获取Transaction对象，由具体子类实现
   Object transaction = doGetTransaction();
  //如果事务配置为空，创建一个默认实现
   if (definition == null) {
      definition = new DefaultTransactionDefinition();
   }
	//在这里要处理多事务共存的情况，根据不同的传播行为来实现不同的业务处理
   if (isExistingTransaction(transaction)) {
      return handleExistingTransaction(definition, transaction, debugEnabled);
   }
   //确定不存在事务，要开启一个新事务，根据不同的事务传播行为进行处理
   if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_MANDATORY) {
      throw new IllegalTransactionStateException(
            "No existing transaction found for transaction marked with propagation 'mandatory'");
   }//根据事务传播行为配置，开启一个新事务
  else if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRED ||definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW ||definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NESTED) {
    //暂停一个空事务
      SuspendedResourcesHolder suspendedResources = suspend(null);
      try {
         boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
        //构建一个DefaultTransactionStatus对象，用于封装事务信息
        //新开启的事务 newtransaction = true
         DefaultTransactionStatus status = newTransactionStatus(
               definition, transaction, true, newSynchronization, debugEnabled, suspendedResources);
        //调用子类 开启事务，其实就是创建一个connection，并设置autoCommit = false
         doBegin(transaction, definition);
         prepareSynchronization(status, definition);
         return status;
      } catch (RuntimeException | Error ex) {
        //恢复被挂起的事务
         resume(null, suspendedResources);
         throw ex;
      }
   } else {//无需事务运行，在这里构建一个没有事务的上线文
      boolean newSynchronization = (getTransactionSynchronization() == SYNCHRONIZATION_ALWAYS);
      return prepareTransactionStatus(definition, null, true, newSynchronization, debugEnabled, null);
   }
}
```

AbstractPlatformTransactionManager.handleExistingTransaction方法处理当前已存在事务的情况。根据TransactionDefinition中配置的传播行为来处理多事务共存情况。最终封装返回事务状态对象TransactionStatus。具体处理看代码注释，

注意到 newTransaction 属性的配置，该配置会直接影响事务的提交和回滚操作处理

```java
private TransactionStatus handleExistingTransaction(
      TransactionDefinition definition, Object transaction, boolean debugEnabled)
      throws TransactionException {
   //以非事务方式执行，如果当前存在事务，则抛出异常
   if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NEVER) {
      throw new IllegalTransactionStateException(
            "Existing transaction found for transaction marked with propagation 'never'");
   }
   //以非事务方式执行操作，如果当前存在事务，就把当前事务挂起。 
   if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NOT_SUPPORTED) {     //挂起当前事务
      Object suspendedResources = suspend(transaction);
      boolean newSynchronization = (getTransactionSynchronization() == SYNCHRONIZATION_ALWAYS);
     //构建一个无事务的 TransactionStatus 返回 newtransaction = false
      return prepareTransactionStatus(
            definition, null, false, newSynchronization, debugEnabled, suspendedResources);
   }
   //新建事务，如果当前存在事务，把当前事务挂起，然后新开启一个事务返回事务状态 
   if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_REQUIRES_NEW) {
     //挂起当前事务，并获取被挂起事务的信息，保存在DefaultTransactionStatus中，用于恢复时用
     //挂起的时候会清除掉transaction中的connection，在doBegin的时候会重新获取一个connection
      SuspendedResourcesHolder suspendedResources = suspend(transaction);
      try {
         boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
        //新开启的事务 newtransaction = true
         DefaultTransactionStatus status = newTransactionStatus(
               definition, transaction, true, newSynchronization, debugEnabled, suspendedResources);
        //重新开启一个事务，在doBegin里面会重新获取一个新的connection，开启事务
         doBegin(transaction, definition);
         prepareSynchronization(status, definition);
         return status;
      } catch (RuntimeException | Error beginEx) {
        //开启新事务异常，重新恢复挂起的事务
         resumeAfterBeginException(transaction, suspendedResources, beginEx);
         throw beginEx;
      }
   }
   //如果当前存在事务，则在嵌套事务内执行。如果当前没有事务，则进行与PROPAGATION_REQUIRED类似的操作。 
   if (definition.getPropagationBehavior() == TransactionDefinition.PROPAGATION_NESTED) {
      if (!isNestedTransactionAllowed()) {
         throw new NestedTransactionNotSupportedException(
               "Transaction manager does not allow nested transactions by default - " +
               "specify 'nestedTransactionAllowed' property with value 'true'");
      }
      //使用保存点实现嵌套事务
      if (useSavepointForNestedTransaction()) {
        //嵌套事务，不是一个新开启的事务， newtransaction = false
         DefaultTransactionStatus status =
           prepareTransactionStatus(definition, transaction, false, false, debugEnabled, null);
        //当前事务创建一个 保存点 
         status.createAndHoldSavepoint();
         return status;
      } else {
         boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
         DefaultTransactionStatus status = newTransactionStatus(
               definition, transaction, true, newSynchronization, debugEnabled, null);
         doBegin(transaction, definition);
         prepareSynchronization(status, definition);
         return status;
      }
   }
  //PROPAGATION_REQUIRED -- 支持当前事务，如果当前没有事务，就新建一个事务。这是最常见的选择。 当前已有事务
  //PROPAGATION_SUPPORTS -- 支持当前事务，如果当前没有事务，就以非事务方式执行。当前已有事务
  //这里先判断下方法配置的和当前事务配置的事务隔离级别、只读属性是否一致，如果不一致抛异常
   if (isValidateExistingTransaction()) {
      if (definition.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT) {
         Integer currentIsolationLevel = TransactionSynchronizationManager.getCurrentTransactionIsolationLevel();
         if (currentIsolationLevel == null || currentIsolationLevel != definition.getIsolationLevel()) {
            Constants isoConstants = DefaultTransactionDefinition.constants;
            throw new IllegalTransactionStateException("Participating transaction with definition [" +
                  definition + "] specifies isolation level which is incompatible with existing transaction: " +
                  (currentIsolationLevel != null ?
                        isoConstants.toCode(currentIsolationLevel, DefaultTransactionDefinition.PREFIX_ISOLATION) :
                        "(unknown)"));
         }
      }
      if (!definition.isReadOnly()) {
         if (TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalTransactionStateException("Participating transaction with definition [" +
                  definition + "] is not marked as read-only but existing transaction is");
         }
      }
   }
  //在当前事务中运行
   boolean newSynchronization = (getTransactionSynchronization() != SYNCHRONIZATION_NEVER);
  //当前事务中运行，不是一个新开启的事务， newtransaction = false
   return prepareTransactionStatus(definition, transaction, false, newSynchronization, debugEnabled, null);
}
```

prepareTransactionStatus方法中返回了 DefaultTransactionStatus 对象。同时通过TransactionSynchronizationManager类将当前事务状态配置到ThreadLocal中。

```java
protected final DefaultTransactionStatus prepareTransactionStatus(
			TransactionDefinition definition, @Nullable Object transaction, boolean newTransaction,
			boolean newSynchronization, boolean debug, @Nullable Object suspendedResources) {
		DefaultTransactionStatus status = newTransactionStatus(
				definition, transaction, newTransaction, newSynchronization, debug, suspendedResources);
		prepareSynchronization(status, definition);
		return status;
	}
protected DefaultTransactionStatus newTransactionStatus(
			TransactionDefinition definition, @Nullable Object transaction, boolean newTransaction,
			boolean newSynchronization, boolean debug, @Nullable Object suspendedResources) {
		boolean actualNewSynchronization = newSynchronization &&
				!TransactionSynchronizationManager.isSynchronizationActive();
		return new DefaultTransactionStatus(
				transaction, newTransaction, actualNewSynchronization,
				definition.isReadOnly(), debug, suspendedResources);
	}
protected void prepareSynchronization(DefaultTransactionStatus status, TransactionDefinition definition) {
		if (status.isNewSynchronization()) {
			TransactionSynchronizationManager.setActualTransactionActive(status.hasTransaction());
			TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(
					definition.getIsolationLevel() != TransactionDefinition.ISOLATION_DEFAULT ?
							definition.getIsolationLevel() : null);
			TransactionSynchronizationManager.setCurrentTransactionReadOnly(definition.isReadOnly());
			TransactionSynchronizationManager.setCurrentTransactionName(definition.getName());
			TransactionSynchronizationManager.initSynchronization();
		}
	}
```

分析完开启事务的返回结果，接下来看下当需要挂起当前事务的时候，是如何挂起的。AbstractPlatformTransactionManager.suspend方法用于挂起事务，在该方法中会调用子类挂起事务，同时返回被挂起事务对象及其配置信息返回，当事务恢复的时候需要依赖这些配置信息用于恢复。

```java
protected final SuspendedResourcesHolder suspend(@Nullable Object transaction) throws TransactionException {
   if (TransactionSynchronizationManager.isSynchronizationActive()) {
      List<TransactionSynchronization> suspendedSynchronizations = doSuspendSynchronization();
      try {
         Object suspendedResources = null;
         if (transaction != null) {
           //子类覆写实现 事务挂起，同时返回被挂起事务的信息
           //其实就是将transaction中的connection移除并封装到suspendedResources中返回
            suspendedResources = doSuspend(transaction);
         }
        //获取被挂起事务存储在ThreadLocal中的配置，封装被挂起事务的配置信息返回
         String name = TransactionSynchronizationManager.getCurrentTransactionName();
         TransactionSynchronizationManager.setCurrentTransactionName(null);
         boolean readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();
         TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
         Integer isolationLevel = TransactionSynchronizationManager.getCurrentTransactionIsolationLevel();
         TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(null);
         boolean wasActive = TransactionSynchronizationManager.isActualTransactionActive();
         TransactionSynchronizationManager.setActualTransactionActive(false);
         return new SuspendedResourcesHolder(
               suspendedResources, suspendedSynchronizations, name, readOnly, isolationLevel, wasActive);
      } catch (RuntimeException | Error ex) {
         // doSuspend failed - original transaction is still active...
         doResumeSynchronization(suspendedSynchronizations);
         throw ex;
      }
   } else if (transaction != null) {
      // 挂起事务
      Object suspendedResources = doSuspend(transaction);
      return new SuspendedResourcesHolder(suspendedResources);
   } else {
      //当前不存在事务，所以无需挂起
      return null;
   }
}
```

当事务开启异常时，需要恢复被挂起的事务，AbstractPlatformTransactionManager.resume用于恢复事务，将TransactionStatus中的SuspendedResources(挂起事务中的资源)重新放回到ThreadLocal中，该逻辑通过子类doResume方法实现，然后将其事务状态配置重新设置到ThreadLocal中。

```java
protected final void resume(@Nullable Object transaction, @Nullable SuspendedResourcesHolder resourcesHolder)  throws TransactionException {

   if (resourcesHolder != null) {
      Object suspendedResources = resourcesHolder.suspendedResources;
      if (suspendedResources != null) {
        //子类覆写实现，其实就是将suspendedResources中的connection放到ThreadLocal中
         doResume(transaction, suspendedResources);
      }
      List<TransactionSynchronization> suspendedSynchronizations = resourcesHolder.suspendedSynchronizations;
     //恢复ThreadLocal中被挂起事务的配置
      if (suspendedSynchronizations != null) {
TransactionSynchronizationManager.setActualTransactionActive(resourcesHolder.wasActive);
TransactionSynchronizationManager.setCurrentTransactionIsolationLevel(resourcesHolder.isolationLevel);       TransactionSynchronizationManager.setCurrentTransactionReadOnly(resourcesHolder.readOnly);
         TransactionSynchronizationManager.setCurrentTransactionName(resourcesHolder.name);
         doResumeSynchronization(suspendedSynchronizations);
      }
   }
}
```

分析完了AbstractPlatformTransactionManager中开启事务的整体执行流程，然后看下子类中 doGetTransaction(获取事务对象)、isExistingTransaction(是否已开启事务)、deBegin(开启事务)、doSuspend(挂起事务)、doResume(恢复事务)的具体实现，接下来以最常用的DataSourceTransactionManager举例

DataSourceTransactionManager覆写了AbstractPlatformTransactionManager的方法，提供了事务对象的具体操作，同时封装了一个DataSource，用于获取connection。

#### 获取事务对象

DataSourceTransactionManager返回的事务对象是DataSourceTransactionObject，里面主要就是封装了一个ConnectionHolder对象，ConnectionHolder主要用于存储一个数据库连接Connection对象。

注意这里不是直接通过DataSource去获取Connection的，而是通过TransactionSynchronizationManager去ThreadLocal获取。如果能获取到证明可能已存在事务,返回connection; 如果获取不到Connection，就是返回一个null。

在spring中sql的执行也是会先通过TransactionSynchronizationManager去ThreadLocal中获取Connection，这样就实现了开启事务和sql执行用的是一个Connection

```java
@Override
protected Object doGetTransaction() {
   DataSourceTransactionObject txObject = new DataSourceTransactionObject();
   txObject.setSavepointAllowed(isNestedTransactionAllowed());
  
   ConnectionHolder conHolder =
         (ConnectionHolder) TransactionSynchronizationManager.getResource(obtainDataSource());
  //这里有可能返回conHolder值，所以有可能不是新建的，直接设置newConnectionHolder=false，dobegin需要新获取connection的时候会重新设置为true 
  txObject.setConnectionHolder(conHolder, false);
   return txObject;
}
```

TransactionSynchronizationManager用于获取ThreadLocal中设置的数据库连接信息，key是当前数据源对象

```java
@Nullable
public static Object getResource(Object key) {
   Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
   Object value = doGetResource(actualKey);
   return value;
}
```

从ThreadLocal获取Connection信息

```java
private static Object doGetResource(Object actualKey) {
   Map<Object, Object> map = resources.get();
   if (map == null) {
      return null;
   }
   Object value = map.get(actualKey);
   // Transparently remove ResourceHolder that was marked as void...
   if (value instanceof ResourceHolder && ((ResourceHolder) value).isVoid()) {
      map.remove(actualKey);
      // Remove entire ThreadLocal if empty...
      if (map.isEmpty()) {
         resources.remove();
      }
      value = null;
   }
   return value;
}
```

#### 判断是否已在一个事务中

TransactionSynchronizationManager实现了isExistingTransaction方法。接收Object类型的transaction对象。因为这个对象就是该实现类自己创建的，所以可以直接强转为DataSourceTransactionObject类型，事务开启的条件为txObject中存在一个TransactionActive = true 的ConnectionHolder

**注意：当事务开启成功后(setAutoCommit=false)会设置 transactionActive = true**

```java
@Override
protected boolean isExistingTransaction(Object transaction) {
   DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
   return (txObject.hasConnectionHolder() && txObject.getConnectionHolder().isTransactionActive());
}
```

#### 开启事务

doBegin方法中会从数据源中获取一个connection连接，然后设置autoCommit=false。可以看到事务开启的本质就是返回一个autoCommit=false的connection。

事务开启成功之后，设置事务开启标识 setTransactionActive = true

如果是新获取的connection，证明是一个新事务，则调用TransactionSynchronizationManager.bindResource将connectionHolder设置到ThreadLocal当中

```java
@Override
protected void doBegin(Object transaction, TransactionDefinition definition) {
   DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
   Connection con = null;
   try {
     //开启事务前获取事务连接 connection，如果事务对象中的有了connection就不需要获取了，如果没有去DataSource中获取一个新的connection，构建一个新的ConnectionHolder
      if (!txObject.hasConnectionHolder() ||
            txObject.getConnectionHolder().isSynchronizedWithTransaction()) {
        //从数据源中获取connection
         Connection newCon = obtainDataSource().getConnection();
        //放到事务对象的connectionHolder中,重新获取的connection，设置newConnectionHolder=true
         txObject.setConnectionHolder(new ConnectionHolder(newCon), true);
      }
      txObject.getConnectionHolder().setSynchronizedWithTransaction(true);
      con = txObject.getConnectionHolder().getConnection();
      //将事务配置设定到connection上，同时记录下 connection 原始的配置，事务完成之后connection状态重置回去
      Integer previousIsolationLevel = DataSourceUtils.prepareConnectionForTransaction(con, definition);
      txObject.setPreviousIsolationLevel(previousIsolationLevel);
      //关闭自动提交，开启事务
      if (con.getAutoCommit()) {
         txObject.setMustRestoreAutoCommit(true);
         con.setAutoCommit(false);
      }
      prepareTransactionalConnection(con, definition);
     //事务开启成功，设置事务对象中的TransactionActive=true，用于快速判断是否开启事务
      txObject.getConnectionHolder().setTransactionActive(true);

      int timeout = determineTimeout(definition);
     //配置事务超时时间
      if (timeout != TransactionDefinition.TIMEOUT_DEFAULT) {
         txObject.getConnectionHolder().setTimeoutInSeconds(timeout);
      }
      // 将连接信息绑定到ThreadLocal中，sql执行的时候和事务传播行为都会去ThreadLocal获取连接
      if (txObject.isNewConnectionHolder()) {
         TransactionSynchronizationManager.bindResource(obtainDataSource(), txObject.getConnectionHolder());
      }
   } catch (Throwable ex) {
     //异常则关闭 connection 连接，重置 txObject
      if (txObject.isNewConnectionHolder()) {
         DataSourceUtils.releaseConnection(con, obtainDataSource());
         txObject.setConnectionHolder(null, false);
      }
      throw new CannotCreateTransactionException("Could not open JDBC Connection for transaction", ex);
   }
}
```

新获取的connection需要通过TransactionSynchronizationManager将开启事务的connection放到ThreadLocal中。保证事务过程中用的connection能够被执行sql的代码拿到

```java
public static void bindResource(Object key, Object value) throws IllegalStateException {
   Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
   Assert.notNull(value, "Value must not be null");
   Map<Object, Object> map = resources.get();
   // set ThreadLocal Map if none found
   if (map == null) {
      map = new HashMap<>();
      resources.set(map);
   }
   Object oldValue = map.put(actualKey, value);
   // Transparently suppress a ResourceHolder that was marked as void...
   if (oldValue instanceof ResourceHolder && ((ResourceHolder) oldValue).isVoid()) {
      oldValue = null;
   }
   if (oldValue != null) {
      throw new IllegalStateException("Already value [" + oldValue + "] for key [" +
            actualKey + "] bound to thread [" + Thread.currentThread().getName() + "]");
   }
}
```

#### 挂起事务

操作的还是DataSourceTransactionObject对象。事务挂起的本质就是移除并返回事务对象transaction中原有的connection连接。然后再调用TransactionSynchronizationManager移除ThreadLocal中的connection。

感觉spring这种代码还是带点坑的，修改参数对象中的值，出问题不好定位，最好的处理是返回一个操作完的新的对象

```java
@Override
protected Object doSuspend(Object transaction) {
   DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
   txObject.setConnectionHolder(null);//移除对象中的connection连接
  //移除ThreadLocal中的connection
   return TransactionSynchronizationManager.unbindResource(obtainDataSource());
}
```

通过TransactionSynchronizationManager移除ThreadLocal中的connection

```java
public static Object unbindResource(Object key) throws IllegalStateException {
   Object actualKey = TransactionSynchronizationUtils.unwrapResourceIfNecessary(key);
   Object value = doUnbindResource(actualKey);
   return value;
}
private static Object doUnbindResource(Object actualKey) {
		Map<Object, Object> map = resources.get();
		if (map == null) {
			return null;
		}
  //移除ThreadLocal中connection 并返回
		Object value = map.remove(actualKey);
   //此处省略代码。。。
		return value;
}
```

#### 恢复事务

恢复事务就是将挂起资源中的connection通过TransactionSynchronizationManager重新放到ThreadLocal中

感觉这里应该同时将connection设置回transaction中啊，这样才能和挂起事务对应。

```java
@Override
protected void doResume(@Nullable Object transaction, Object suspendedResources) {
   TransactionSynchronizationManager.bindResource(obtainDataSource(), suspendedResources);
}
```

### 提交事务

AbstractPlatformTransactionManager.commit定义了提交事务的流程，在事务提交的时候首先要判断下TransactionStatus的rollbackOnly状态，如果是true，则回滚事务。否则调用processCommit方法提交

如果当前是运行在外层事务中，发生异常，不方便直接回滚，则标记rollbackOnly=true，当外层执行提交的时候再进行回滚

```java
public final void commit(TransactionStatus status) throws TransactionException {
  if (status.isCompleted()) {
			throw new IllegalTransactionStateException("Transaction is already completed - do not call commit or rollback more than once per transaction");
		}
   DefaultTransactionStatus defStatus = (DefaultTransactionStatus) status;
  //如果标记了 localRollbackOnly=true 提交的时候直接回滚
  //TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
   if (defStatus.isLocalRollbackOnly()) {
      processRollback(defStatus, false);
      return;
   }
	 //根据配置判断提交的时候短路走回滚逻辑 
   if (!shouldCommitOnGlobalRollbackOnly() && defStatus.isGlobalRollbackOnly()) {
      processRollback(defStatus, true);
      return;
   }
   //提交事务
   processCommit(defStatus);
}
```

在processCommit方法会调用一些事务提交和完成前后的事件，根据TransactionStatus的状态进行不同的操作

- 如果是嵌套事务，包含保存点，则直接释放保存点就可以，提交由外层事务完成
- 如果是一个新开启的事务，调用子类实现的 doCommit方法，其实就是执行connection的commit方法

```java
private void processCommit(DefaultTransactionStatus status) throws TransactionException {
   try {
      boolean beforeCompletionInvoked = false;
      try {
         boolean unexpectedRollback = false;
         prepareForCommit(status);
         triggerBeforeCommit(status);// 触发提交前事件
         triggerBeforeCompletion(status);//触发完成前事件
         beforeCompletionInvoked = true;
        //事务提交的时候如果是嵌套事务，有保存点， 则释放保存点，无需提交事务，完成
         if (status.hasSavepoint()) {
            unexpectedRollback = status.isGlobalRollbackOnly();
            status.releaseHeldSavepoint();
         } else if (status.isNewTransaction()) {
            //调用子类实现的 doCommit 提交事务
            unexpectedRollback = status.isGlobalRollbackOnly();
            doCommit(status);
         } else if (isFailEarlyOnGlobalRollbackOnly()) {
            unexpectedRollback = status.isGlobalRollbackOnly();
         }
         //全局标记了回滚，回滚  RollbackOnly=true
         if (unexpectedRollback) {
            throw new UnexpectedRollbackException(
             "Transaction silently rolled back because it has been marked as rollback-only");
         }
      } catch (UnexpectedRollbackException ex) {
         // 触发事务完成 事件
         triggerAfterCompletion(status, TransactionSynchronization.STATUS_ROLLED_BACK);
         throw ex;
      } catch (TransactionException ex) {
         // 异常后回滚
         if (isRollbackOnCommitFailure()) {
            doRollbackOnCommitException(status, ex);
         } else {
           //触发事务完成 事件
            triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
         }
         throw ex;
      } catch (RuntimeException | Error ex) {
         if (!beforeCompletionInvoked) {
            triggerBeforeCompletion(status);
         }
        //异常回滚
         doRollbackOnCommitException(status, ex);
         throw ex;
      }
      //触发事务提交完成事件和事务完成事件
      try {
         triggerAfterCommit(status);
      } finally {
         triggerAfterCompletion(status, TransactionSynchronization.STATUS_COMMITTED);
      }
   } finally {
     //完成后清除事务信息，清除当前ThreadLocal中的信息，释放connection，恢复挂起的事务
      cleanupAfterCompletion(status);
   }
}
```

子类DataSourceTransactionManager中实现了提交的具体操作，本质就是获取事务对象中的connection，然后调用jdbc的api commit提交。

```java
@Override
protected void doCommit(DefaultTransactionStatus status) {
   DataSourceTransactionObject txObject = (DataSourceTransactionObject) status.getTransaction();//获取事务对象中的connection
   Connection con = txObject.getConnectionHolder().getConnection();
   try {//调用connection的commit方法提交事务
      con.commit();
   } catch (SQLException ex) {
      throw new TransactionSystemException("Could not commit JDBC transaction", ex);
   }
}
```

事务完成之后，只要进行资源的释放、事务配置信息的清除和挂起事务的恢复，所以在finnaly里面调用了cleanupAfterCompletion方法

1. 清除ThreadLocal中事务状态信息
2. 如果是新开启的时候，调用子类释放connection资源，如果是运行在其他事务中，无需操作
3. 如果存在被挂起的事务，恢复

```java
private void cleanupAfterCompletion(DefaultTransactionStatus status) {
   status.setCompleted();
   //如果已经将事务状态信息保存到ThreadLocal中，清除 ThreadLocal中的事务状态配置
   if (status.isNewSynchronization()) {
      TransactionSynchronizationManager.clear();
   }
  //如果是新开启的事务，调用子类释放连接信息
   if (status.isNewTransaction()) {
      doCleanupAfterCompletion(status.getTransaction());
   }
   if (status.getSuspendedResources() != null) {
      Object transaction = (status.hasTransaction() ? status.getTransaction() : null);
     //恢复 挂起的事务
      resume(transaction, (SuspendedResourcesHolder) status.getSuspendedResources());
   }
}
```

TransactionSynchronizationManager.clear 用于清除ThreadLocal中的的事务状态配置信息

```java
public static void clear() {
   synchronizations.remove();
   currentTransactionName.remove();
   currentTransactionReadOnly.remove();
   currentTransactionIsolationLevel.remove();
   actualTransactionActive.remove();
}
```

新开启的事务需要调用子类释放事务资源

1. 移除ThreadLocal中connection
2. 将 connection 的autoCommit设置为true
3. 调用DataSource方法释放connection

```java
protected void doCleanupAfterCompletion(Object transaction) {
   DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;
   //清除ThreadLocal中的 connection信息
   if (txObject.isNewConnectionHolder()) {
      TransactionSynchronizationManager.unbindResource(obtainDataSource());
   }
   //重置 autoCommit = true
   Connection con = txObject.getConnectionHolder().getConnection();
   try {
      if (txObject.isMustRestoreAutoCommit()) {
         con.setAutoCommit(true);
      }
      DataSourceUtils.resetConnectionAfterTransaction(con, txObject.getPreviousIsolationLevel());
   } catch (Throwable ex) {
      logger.debug("Could not reset JDBC Connection after transaction", ex);
   }
   //调用 DataSource 关闭 connection
   if (txObject.isNewConnectionHolder()) {
      DataSourceUtils.releaseConnection(con, this.dataSource);
   }

   txObject.getConnectionHolder().clear();
}
```

### 回滚事务

AbstractPlatformTransactionManager.commit定义了回滚事务的流程，调用processRollback进行回滚事务

```java
public final void rollback(TransactionStatus status) throws TransactionException {
   if (status.isCompleted()) {
      throw new IllegalTransactionStateException("Transaction is already completed - do not call commit or rollback more than once per transaction");
   }
   DefaultTransactionStatus defStatus = (DefaultTransactionStatus) status;
   processRollback(defStatus, false);
}
```

在processRollback方法会调用一些事务回滚和完成前后的事件，根据 TransactionStatus 的状态进行不同的操作，回滚操作完毕后，调用cleanupAfterCompletion清理事务信息

- 如果有 保存点 ，直接回滚到 保存点
- 如果是一个新启的事务，调用子类实现doRollback进行回滚，其实就是调用connection.rollback.
- 如果运行在外层事务，直接标记当前事务 rollbackOnly =true，当外层事务提交的时候会进行回滚

```java
private void processRollback(DefaultTransactionStatus status, boolean unexpected) {
   try {
      boolean unexpectedRollback = unexpected;
      try {
         triggerBeforeCompletion(status);
					//如果有保存点，回滚到保存点
         if (status.hasSavepoint()) {
            status.rollbackToHeldSavepoint();
         }//如果是一个新的事务，调用子类实现 回滚事务
         else if (status.isNewTransaction()) {
            doRollback(status);
         } else {
            // Participating in larger transaction
            if (status.hasTransaction()) {
               if (status.isLocalRollbackOnly() || isGlobalRollbackOnParticipationFailure()) {
                  doSetRollbackOnly(status);
               } else {
                  if (status.isDebug()) {
                     logger.debug("Participating transaction failed - letting transaction originator decide on rollback");
                  }
               }
            } else {//不存在事务，无需回滚
               logger.debug("Should roll back transaction but cannot - no transaction available");
            }
            // Unexpected rollback only matters here if we're asked to fail early
            if (!isFailEarlyOnGlobalRollbackOnly()) {
               unexpectedRollback = false;
            }
         }
      } catch (RuntimeException | Error ex) {
        //回滚异常, 触发事务完成事件
         triggerAfterCompletion(status, TransactionSynchronization.STATUS_UNKNOWN);
         throw ex;
      }
      //回滚成功后触发事务完成事件
      triggerAfterCompletion(status, TransactionSynchronization.STATUS_ROLLED_BACK);
      // Raise UnexpectedRollbackException if we had a global rollback-only marker
      if (unexpectedRollback) {
         throw new UnexpectedRollbackException(
               "Transaction rolled back because it has been marked as rollback-only");
      }
   } finally {
     //完成后清除事务信息，清除当前ThreadLocal中的信息，释放connection，恢复挂起的事务
      cleanupAfterCompletion(status);
   }
}
```

子类DataSourceTransactionManager中实现了回滚的具体操作，本质就是获取事务对象中的connection，然后调用jdbc的api rollback回滚。

```java
protected void doRollback(DefaultTransactionStatus status) {
   DataSourceTransactionObject txObject = (DataSourceTransactionObject) status.getTransaction();
   Connection con = txObject.getConnectionHolder().getConnection();
   try {//调用connection的rollback
      con.rollback();
   } catch (SQLException ex) {
      throw new TransactionSystemException("Could not roll back JDBC transaction", ex);
   }
}
```

## sql执行与事务结合

### 事务与sql执行用统一connection对象

来看JdbcTemplate的execute方法，所有的sql执行都会通过该方法执行,在该方法中第一步会通过jdbc配置的DataSource获取connection，DataSourceUtils要保证能获取到开启事务的connection，从而实现事务控制。在这里就用到了TransactionSynchronizationManager去ThreadLocal中获取开启事务的connection。

```java
public <T> T execute(PreparedStatementCreator psc, PreparedStatementCallback<T> action)
      throws DataAccessException {
   //获取 connection
   Connection con = DataSourceUtils.getConnection(obtainDataSource());
   PreparedStatement ps = null;
   try {
      ps = psc.createPreparedStatement(con);
     //这里会应用到事务配置的超时时间 timeout
      applyStatementSettings(ps);
      T result = action.doInPreparedStatement(ps);
      handleWarnings(ps);
      return result;
   }

}
```

DataSourceUtils.getConnection用于获取connection

```java
public static Connection getConnection(DataSource dataSource) throws CannotGetJdbcConnectionException {
  return doGetConnection(dataSource);
}
```

在doGetConnection方法中会首先通过**TransactionSynchronizationManager**去ThreadLocal中获取当前数据源的connection，spring的事务也是将connection保存在TransactionSynchronizationManager的ThreadLocal中的，这样就保证了事务管理和sql执行用的是一个connection

要注意的是，**获取connection的key是DataSource对象，所以事务管理的DataSource和jdbc的DataSource一定要用一个对象，不然会导致事务失效**

```java
public static Connection doGetConnection(DataSource dataSource) throws SQLException {
   Assert.notNull(dataSource, "No DataSource specified");
  //也通过TransactionSynchronizationManager去ThreadLocal中获取当前数据源的connection
   ConnectionHolder conHolder = (ConnectionHolder) TransactionSynchronizationManager.getResource(dataSource);
   if (conHolder != null && (conHolder.hasConnection() || conHolder.isSynchronizedWithTransaction())) {
      conHolder.requested();
      if (!conHolder.hasConnection()) {
         logger.debug("Fetching resumed JDBC Connection from DataSource");
         conHolder.setConnection(fetchConnection(dataSource));
      }
      return conHolder.getConnection();
   }
   //ThreadLocal中没有connection，重新从DataSource中获取，然后通过TransactionSynchronizationManager绑定到ThreadLocal中，与事务关联起来
   Connection con = fetchConnection(dataSource);

   if (TransactionSynchronizationManager.isSynchronizationActive()) {
      try {
         ConnectionHolder holderToUse = conHolder;
         if (holderToUse == null) {
            holderToUse = new ConnectionHolder(con);
         }
         else {
            holderToUse.setConnection(con);
         }
         holderToUse.requested();
         TransactionSynchronizationManager.registerSynchronization(
               new ConnectionSynchronization(holderToUse, dataSource));
         holderToUse.setSynchronizedWithTransaction(true);
         if (holderToUse != conHolder) {
            TransactionSynchronizationManager.bindResource(dataSource, holderToUse);
         }
      }
   }

   return con;
}
```

### 事务超时时间(timeout)应用

在事务中会配置 timeout，用于控制事务的超时实现。在事务管理器DataSourceTransactionManager中会将事务配置的timeout配置到事务对象的connection中，而这个connection会通过TransactionSynchronizationManager放到ThreadLocal中的

```java
int timeout = determineTimeout(definition);
if (timeout != TransactionDefinition.TIMEOUT_DEFAULT) {
  txObject.getConnectionHolder().setTimeoutInSeconds(timeout);
}
```

在JdbcTemplate的execute方法中，有一步applyStatementSettings，就会去校验事务的timeout，如果超时则抛出异常回滚事务

```java
public <T> T execute(PreparedStatementCreator psc, PreparedStatementCallback<T> action)
      throws DataAccessException {
   //获取 connection
   Connection con = DataSourceUtils.getConnection(obtainDataSource());
   PreparedStatement ps = null;
   try {
      ps = psc.createPreparedStatement(con);
     //这里会应用到事务配置的超时时间 timeout
      applyStatementSettings(ps);
      T result = action.doInPreparedStatement(ps);
      handleWarnings(ps);
      return result;
   }

}
```

applyStatementSettings最后一步判断事务超时时间

```java
protected void applyStatementSettings(Statement stmt) throws SQLException {
   int fetchSize = getFetchSize();
   if (fetchSize != -1) {
      stmt.setFetchSize(fetchSize);
   }
   int maxRows = getMaxRows();
   if (maxRows != -1) {
      stmt.setMaxRows(maxRows);
   }
   DataSourceUtils.applyTimeout(stmt, getDataSource(), getQueryTimeout());
}
```

applyTimeout中会获取ThreadLocal中的开启事务的connection，调用connectionHolder的getTimeToLiveInSeconds方法，如果已经超时，在该方法中会抛出异常。如果还未超时，设置statement的超时时间为剩余时间，从而实现了事务的超时时间配置

```java
public static void applyTimeout(Statement stmt, @Nullable DataSource dataSource, int timeout) throws SQLException {
   Assert.notNull(stmt, "No Statement specified");
   ConnectionHolder holder = null;
  //通过TransactionSynchronizationManager获取ThreadLocal中的 connectionHolder
   if (dataSource != null) {
      holder = (ConnectionHolder) TransactionSynchronizationManager.getResource(dataSource);
   }
  //获取connectionHolder上配置的事务超时时间
   if (holder != null && holder.hasTimeout()) {
      stmt.setQueryTimeout(holder.getTimeToLiveInSeconds());
   }
   else if (timeout >= 0) {
      stmt.setQueryTimeout(timeout);
   }
}
```

ConnectionHolder.getTimeToLiveInSeconds方法，dealine是根据timeout计算出的事务到期时间，在getTimeToLiveInSeconds方法中如果已经到达deadline，则调用checkTransactionTimeout进行事务回滚或者标记事务回滚，从而实现事务的超时回滚

```java
//设置timeout的时候 会计算出何时超时 deadline
public void setTimeoutInMillis(long millis) {
  this.deadline = new Date(System.currentTimeMillis() + millis);
}

public int getTimeToLiveInSeconds() {
   double diff = ((double) getTimeToLiveInMillis()) / 1000;
   int secs = (int) Math.ceil(diff);
   checkTransactionTimeout(secs <= 0);
   return secs;
}

public long getTimeToLiveInMillis() throws TransactionTimedOutException{
		if (this.deadline == null) {
			throw new IllegalStateException("No timeout specified for this resource holder");
		}
		long timeToLive = this.deadline.getTime() - System.currentTimeMillis();
  //如果达到超时时间，调用checkTransactionTimeout抛出异常
		checkTransactionTimeout(timeToLive <= 0);
		return timeToLive;
	}

private void checkTransactionTimeout(boolean deadlineReached) throws TransactionTimedOutException {
		if (deadlineReached) {
			setRollbackOnly();
			throw new TransactionTimedOutException("Transaction timed out: deadline was " + this.deadline);
		}
	}
```

分析完timeout的实现，注意，事务的超时时通过sql的执行去判断从而进行回滚的，但是一个spring事务中包含的是一个方法，在方法中不仅会执行sql，也会有其他语句

如果方法最后有个sql执行，那么事务的超时时间配置能够应用

如果方法最后是个非sql执行的语句，而且很耗时间，会导致整个事务方法的执行时间超过事务的timeout配置。

## 事务隔离级别

| 隔离级别      | 描述                                                         | 场景                                                         |
| ------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| REQUIRED      | 必须运行在事务中，当前已存在事务时在事务中运行;当前不存在事务则开启一个新事务 | 运行在一个单层事务中，避免嵌套事务                           |
| SUPPORTS      | 可以运行在事务中，如果当前已存在事务时在事务中运行;当前不存在事务则直接无事务运行 | 当一个查询单独存在时无需运行在事务中；当先执行了带事务的更新，再调用查询，则查询就需要运行在事务中，在不同的隔离级别下很有用 |
| MANDATORY     | 必须运行在事务中，如果当前已存在事务时在事务中运行;当前不存在事务时抛出异常 | 当一个方法需要事务环境，但不负责事务的开启、提交、回滚       |
| REQUIRES_NEW  | 必须运行在事务中，如果当前已存在事务时则挂起当前事务，开启新事务运行结束后恢复被挂起事务;当前不存在事务则开启一个新事务运行 | 内层事务的回滚和提交和外层事务的回滚和提交互不影响，制造一个内层独立的小事务 |
| NOT_SUPPORTED | 必须不运行在事务中，如果当前已存在事务时则挂起当前事务，无事务运行结束后恢复被挂起事务;当前不存在事务则直接无事务运行 | 保证当前执行一定不运行在事务当中，但是又允许已经在事务中的逻辑调用 |
| NEVER         | 必须不运行在事务中，如果当前已存在事务时则抛出异常;当前不存在事务则直接无事务运行 | 当前一定不能运行在事务中，一些涉及外部调用，耗时长，为了避免导致事务出问题，标记NEVER，在开发阶段发现问题直接解决 |
| NESTED        | 如果当前已存在事务时则创建savepoint，然后在事务中运行;当前不存在事务开启新事务运行 | 基于保存点，内层事务的回滚和提交不会影响外层事务。 外层事务的回滚和提交会影响内层事务 |





