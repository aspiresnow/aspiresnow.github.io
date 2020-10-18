---
title: java线程池
date: 2017-09-01 15:51:24
tags:
- 多线程
categories:
- java基础

---

#  线程池

## 知识导读

- CPU密集性配置N+1个线程的，即使当计算（CPU）密集型的线程偶尔由于页缺失故障或者其他原因而暂停时，这个“额外”的线程也能确保 CPU 的时钟周期不会被浪费。
- 对于IO密集型任务，提高CPU利用率，将线程数设置为2*N；或者通过时间计算 **线程数=cpu个数 * (1+等待时间/CPU时间)** 
- 线程池调优配置主要就是3个参数，可以做个基于配置中心动态调整到线程池，线程池支持setCorePoolSize、setMaximumPoolSize、setKeepAliveTime，队列不支持动态修改长度，但是可以自定义一个支持的
  - corePoolSize
  - maximumPoolSize
  - 阻塞队列长度
- 线程池创建后是没有线程的，可以通过prestartAllCoreThreads方法预热，创建出所有的核心线程。prestartCoreThread创建出一个核心线程
- 任务拒绝策略要结合报警、人工介入处理

## 线程池介绍

线程池的优点：

1. 降低系统资源消耗，通过重用已存在的线程，降低线程创建和销毁造成的消耗；
2. 有效的控制线程的最大并发数，线程若是无限制的创建，会增加资源竞争，导致CPU切换严重引起阻塞、引发oom等。线程池能有效管控线程，统一分配、调优，提供资源使用率；
3. 提高系统响应速度，当有任务到达时，立即执行，无需等待新线程的创建；
4. 能够对线程进行简单的管理并提供定时执行、间隔执行等功能。

线程池解决的核心问题就是资源管理问题。在并发环境下，系统不能够确定在任意时刻中，有多少任务需要执行，有多少资源需要投入。这种不确定性将带来以下若干问题：

1. 频繁申请/销毁资源和调度资源，将带来额外的消耗，可能会非常巨大。
2. 对资源无限申请缺少抑制手段，易引发系统资源耗尽的风险。
3. 系统无法合理管理内部的资源分布，会降低系统的稳定性。

ExecutorService基于池化的线程来执行用户提交的任务，通常可以简单的通过Executors提供的工厂方法来创建ThreadPoolExecutor实例。

主要包括以下几个方面:

- 线程池大小参数的设置 
- 工作线程的创建
- 空闲线程的回收
- 阻塞队列的使用
- 任务拒绝策略
- 线程池Hook

## 线程池实现原理

### 线程池的组成部分

1. 线程池管理器：用于创建并管理线程池
2. 工作线程：线程池中的线程
3. 任务接口：每个任务必须实现的接口，用于工作线程调度其运行
4. 任务队列：用于存放待处理的任务，提供一种缓冲机制

### 线程池的实现方式

ThreadPoolExecutor的构造函数

```java
public ThreadPoolExecutor(int corePoolSize,
                              int maximumPoolSize,
                              long keepAliveTime,
                              TimeUnit unit,
                              BlockingQueue<Runnable> workQueue,
                              ThreadFactory threadFactory,
                              RejectedExecutionHandler handler) {
        if (corePoolSize < 0 ||
            maximumPoolSize <= 0 ||
            maximumPoolSize < corePoolSize ||
            keepAliveTime < 0)
            throw new IllegalArgumentException();
        if (workQueue == null || threadFactory == null || handler == null)
            throw new NullPointerException();
        this.corePoolSize = corePoolSize;
        this.maximumPoolSize = maximumPoolSize;
        this.workQueue = workQueue;
        this.keepAliveTime = unit.toNanos(keepAliveTime);
        this.threadFactory = threadFactory;
        this.handler = handler;
    }
```

- corePoolSize：线程池的核心线程数，默认情况下会永远存活，当ThreadPoolExecutor 中的方法 allowCoreThreadTimeOut(boolean value) 设置为 true 时，如果在指定时间没有新任务来时，核心线程也会被终止
- maximumPoolSize：线程池中允许的最大线程数，当队列满了，且已创建的线程数小于maximumPoolSize，则线程池会创建新的线程来执行任务。对于无界队列，可忽略该参数。
- keepAliveTime：空闲线程结束的超时时间
- unit：是一个枚举，它表示的是 keepAliveTime 的单位
- workQueue：工作队列，用于存放任务
- threadFactory：线程工厂，使用new Thread()为线程池提供新线程的创建，默认为DefaultThreadFactory类。由同一个threadFactory创建的线程，属于同一个ThreadGroup，创建的线程优先级都为Thread.NORM_PRIORITY
- handler：拒绝策略，当线程数超过上限并且工作队列满了情况下对任务线程的处理策略，默认策略为ThreadPoolExecutor.AbortPolicy

#### 线程池工作过程

1. 线程池刚创建时，里面没有一个线程。任务队列是作为参数传进来的。不过，就算队列里面有任务，线程池也不会马上执行它们。

2. 当调用 execute() 方法添加一个任务时，线程池会做如下判断：

   1. 首先检测线程池运行状态，如果不是RUNNING，则直接拒绝，线程池要保证在RUNNING的状态下执行任务。

   2. 如果正在运行的线程数量小于 corePoolSize，那么马上创建线程运行这个任务,即使线程池中的线程都处于空闲状态，也要创建新的线程来处理被添加的任务

   3. 如果正在运行的线程数量大于或等于 corePoolSize，那么将这个任务放入队列

   4. 如果这时候队列满了，而且正在运行的线程数量小于 maximumPoolSize，那么还是要创建非核心线程立刻运行这个任务

   5. 如果队列满了，而且正在运行的线程数量大于或等于 maximumPoolSize，那么线程池会抛出异常RejectExecutionException。

   ```java
   public void execute(Runnable command) {
     if (command == null)
       throw new NullPointerException();
     int c = ctl.get();
     //小于核心线程，则新建核心线程并执行任务
     if (workerCountOf(c) < corePoolSize) {
       //添加时检查线程数据
       if (addWorker(command, true))
         return;
       c = ctl.get();
     }
     //添加队列成功需要再次检查线程池状态和线程数量
     if (isRunning(c) && workQueue.offer(command)) {
       int recheck = ctl.get();
       //如果线程池停掉了 从队列移除任务并拒绝
       if (! isRunning(recheck) && remove(command))
         reject(command);
       //如果线程数小了，创建额外线程，对线程池进行补偿，但是不执行任务
       else if (workerCountOf(recheck) == 0)
         addWorker(null, false);
     }
     //创建小于maxSize的线程并执行任务
     else if (!addWorker(command, false))
       reject(command);//失败调用拒绝策略
   }
   ```

   

   ![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/a0SxSE.jpg)

   - 当一个线程完成任务时，它会从队列中取下一个任务来执行。
   - 当一个线程无事可做，超过一定的时间（keepAliveTime）时，线程池会判断，如果当前运行的线程数大于 corePoolSize，那么这个线程就被停掉。所以线程池的所有任务完成后，它最终会收缩到 corePoolSize 的大小。
   - submit当我们使用submit来提交任务时,它会返回一个future,我们就可以通过这个future来判断任务是否执行成功，还可以通过future的get方法来获取返回值。如果子线程任务没有完成，get方法会阻塞住直到任务完成，而使用get(long timeout, TimeUnit unit)方法则会阻塞一段时间后立即返回，这时候有可能任务并没有执行完。

```java
public class CustomThreadPool {

    public static void main(String[] args) {
        //任务队列 LinkedBlockingQueue
        //BlockingQueue<Runnable> workQueue = new LinkedBlockingQueue();//最多使用掉corePoolSize

        //任务队列 ArrayBlockingQueue
        /*
            pool-1-thread-1：excute task0
            pool-1-thread-4：excute task7 //当任务队列已满，线程池中线程数还未达到maxsize，创建新的线程执行新进来的任务
            pool-1-thread-3：excute task2
            pool-1-thread-5：excute task8
            pool-1-thread-2：excute task1
            java.util.concurrent.RejectedExecutionException: Task cn.zlz.pool.Task@63947c6b rejected from j...//拒绝
            pool-1-thread-1：excute task3 //任务队列中的任务等待线程池中的线程空闲时执行
            pool-1-thread-5：excute task4
            pool-1-thread-3：excute task5
            pool-1-thread-4：excute task6
         */
        BlockingQueue<Runnable> workQueue = new ArrayBlockingQueue<Runnable>(4);//

        //线程工厂
        ThreadFactory factory = Executors.defaultThreadFactory();
        //拒绝策略
        RejectedExecutionHandler handler = new ThreadPoolExecutor.AbortPolicy();

        //创建线程池 coresize：3 max：5
        ThreadPoolExecutor threadPoolExecutor = new ThreadPoolExecutor(3, 5, 5l,
                TimeUnit.MILLISECONDS, workQueue, factory, handler);
        try {
            for (int i = 0; i < 10; i++) {
                threadPoolExecutor.execute(new Task(i));
            }
            System.out.println("main");
        }finally {
            threadPoolExecutor.shutdown();//停止接收任务，并等待执行中的任务执行完毕后停止
            //threadPoolExecutor.shutdownNow();//立即关闭线程池中的所有线程
        }
    }
}

class Task implements Runnable{
    private int index;
    public Task (int index){
        this.index = index;
    }

    @Override
    public void run() {
        System.out.println(Thread.currentThread().getName()+"：excute task"+index);
        try {
            Thread.sleep(3000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }
}
```

### 线程池状态

- RUNNING：可以添加工作线程并执行队列中的任务
- SHUTDOWN：停止创建新的工作线程并停止接收新的任务，等待当前剩余任务的执行完毕 SHUTDOWN()
- STOP：停止创建新的工作线程，停止执行队列任务，中断正在执行的任务线程 shutdownNow()
- TIDYING：任务队列为空，workerCount减为0，准备调用terminated方法 STOP -> TIDYING
- TERMINATED：terminated方法执行完毕，所有线程都得到释放 terminated()

#### 工作队列选择

**直接递交：**

- 工作队列的默认选项是 **SynchronousQueue**，这种队列会将提交的任务直接传送给工作线程，而不持有。如果当前没有工作线程来处理，即任务放入队列失败，则根据线程池的实现，会引发新的工作线程创建，因此新提交的任务会被处理。这种策略在当提交的一批任务之间有依赖关系的时候避免了锁竞争消耗。
- 这种队列最好是配合maximumPoolSizes线程数来使用，从而避免任务被拒绝。同时我们必须要考虑到一种场景，当任务到来的速度大于任务处理的速度，将会引起无限制的线程数不断的增加。

**无界队列：**

- 使用无界队列如LinkedBlockingQueue没有指定最大容量的时候，将会引起当核心线程都在忙的时候，新的任务被放在队列上，因此，永远不会有大于corePoolSize的线程被创建，因此maximumPoolSize参数将失效。
- 这种队列比较适合所有的任务都不相互依赖，独立执行。举个例子，如网页服务器中，每个线程独立处理请求。但是当任务处理速度小于任务进入速度的时候会引起队列的无限膨胀。

**有界队列：**

- 有界队列如ArrayBlockingQueue帮助限制资源的消耗，但是不容易控制。队列长度和maximumPoolSize这两个值会相互影响，使用大的队列和小maximumPoolSize会最大限度地降低 CPU 使用率、操作系统资源和上下文切换开销，但是会降低吞吐量，如果任务被频繁的阻塞如IO线程，系统其实可以调度更多的线程。使用小的队列通常需要大maximumPoolSize，这时CPU 使用率较高，但是可能遇到不可接受的调度开销，这样也会降低吞吐量。
- 总结一下**是IO密集型可以考虑调大maximumPoolSize多些线程来平衡CPU的使用，CPU密集型可以考虑调小maximumPoolSize少些线程减少线程调度的消耗。**

#### 空闲线程回收

如果当前池子中的工作线程数大于corePoolSize，如果超过这个数字的线程处于空闲的时间大于keepAliveTime，则这些线程将会被终止，这是一种减少不必要资源消耗的策略。这个参数可以在运行时被改变，

可以通过调用allowCoreThreadTimeout(true)将过期回收策略应用于核心线程进行回收。

####  拒绝策略

当新的任务到来的而线程池被关闭的时候，或线程数和队列已经达到上限的时候，需要拒绝任务，以下几种拒绝策略：

- ThreadPoolExecutor.AbortPolicy：直接抛出RejectedExecutionException异常。
- ThreadPoolExecutor.CallerRunsPolicy：使用调用者所线程来执行这个任务，这是一种feedback策略，会阻塞调用者线程，降低任务提交的速度。
- ThreadPoolExecutor.DiscardPolicy：直接丢弃无法执行的任务
- ThreadPoolExecutor.DiscardOldestPolicy：从任务队列头部开始丢弃任务，然后重新尝试执行新任务（如果再次失败，则重复此过程），一种类似最旧丢弃策略
- 自定义拒绝策略：实现RejectedExecutionHandler自定义拒绝策略

#### 线程池的执行

- execute(Runnable)

  异步执行一个runable对象，无法得知线程执行状态和结果

  ```java
  ExecutorService threadPool = Executors.newCachedThreadPool();//缓冲池
  threadPool.execute(()->System.out.print("run"));
  ```


- submit(Runnable)

  异步执行一个runable对象，返回一个future对象，调用future.get()会阻塞主线程运行，获取线程运行结果，程序正常接收返回null

  ```java
  ExecutorService threadPool = Executors.newCachedThreadPool();//缓冲池
  Future<?> future = threadPool.submit(() -> System.out.println("run"));
  try {
    System.out.println(future.get());//null
  } catch (InterruptedException e) {
    e.printStackTrace();
  } catch (ExecutionException e) {
    e.printStackTrace();
  }
  ```

- submit(Callable)

  异步执行一个callable对象，返回一个future对象，通过future.get()可以获取callable的返回值

  ```java
  Future future = executorService.submit(n() -> return "run");
  System.out.println("future.get() = " + future.get());
  ```

- invokeAny()

  提交一个callable对象集合，随机返回一个线程执行结果。只能表明其中一个已执行结束。

  如果其中一个任务执行结束(或者抛了一个异常)，其他 Callable 将被取消

  ```java
  ExecutorService threadPool = Executors.newCachedThreadPool();//缓冲池
  List<Callable<String>> list =new ArrayList();
  list.add(()->"task1");
  list.add(()->"task2");
  list.add(()->"task3");
  String result = threadPool.invokeAny(list);
  System.out.println(result);//task1 or task2 or task3
  threadPool.shutdown();
  ```

- invokeAll()

  提交一个callable对象集合,返回执行结果的Future list对象

  ```java
  ExecutorService threadPool = Executors.newCachedThreadPool();//缓冲池
  List<Callable<String>> list = new ArrayList();
  list.add(() -> "task1");
  list.add(() -> "task2");
  list.add(() -> "task3");
  List<Future<String>> futures = null;
  futures = threadPool.invokeAll(list);
  for(Future<String> future:futures){
    System.out.println(future.get());
  }
  ```

  

### 利用Hook嵌入你的行为

ThreadPoolExecutor提供了protected类型可以被覆盖的钩子方法，允许用户在任务执行之前会执行之后做一些事情。继承线程池并重写线程池的beforeExecute()，afterExecute()和terminated()方法，可以在任务执行前、后和线程池关闭前自定义行为。我们可以通过它来实现比如初始化ThreadLocal、收集统计信息、记录日志、监控任务的平均执行时间、最大执行时间和最小执行时间等。

如果hook方法执行失败，则内部的工作线程的执行将会失败或被中断。

利用线程池提供的参数进行监控，参数如下：

- taskCount：线程池需要执行的任务数量。
- completedTaskCount：线程池在运行过程中已完成的任务数量，小于或等于taskCount。
- largestPoolSize：线程池曾经创建过的最大线程数量，通过这个数据可以知道线程池是否满过。如等于线程池的最大大小，则表示线程池曾经满了。
- getPoolSize：线程池的线程数量。如果线程池不销毁的话，池里的线程不会自动销毁，所以这个大小只增不减。
- getActiveCount：获取活动的线程数。
- getQueue：访问queue队列以进行一些统计或者debug工作

```java
public class CustomThreadPoolExecutor extends ThreadPoolExecutor {

    private final ThreadLocal<Long> startLocal = new ThreadLocal();
    private final AtomicLong numTask = new AtomicLong();
    private final AtomicLong totalTime = new AtomicLong();

    public CustomThreadPoolExecutor(int corePoolSize, int maximumPoolSize, long keepAliveTime, TimeUnit unit, BlockingQueue<Runnable> workQueue) {
        super(corePoolSize, maximumPoolSize, keepAliveTime, unit, workQueue);
    }

    @Override
    protected void beforeExecute(Thread t, Runnable r) {
        long start = System.currentTimeMillis();
        //记录开始时间
        startLocal.set(start);
        System.out.println(t.getName() + "start excute");
        //最后调用父类
        super.beforeExecute(t, r);

    }

    @Override
    protected void afterExecute(Runnable r, Throwable t) {
        //先调用父类
        super.afterExecute(r, t);
        if (t == null && r instanceof Future<?>) {
            try {
                Object result = ((Future<?>) r).get();
            } catch (CancellationException ce) {
                t = ce;
            } catch (ExecutionException ee) {
                t = ee.getCause();
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt(); // ignore/reset
            }
        }
        long end = System.currentTimeMillis();
        numTask.incrementAndGet();
        long useTime = end - (startLocal.get());
        System.out.println(Thread.currentThread().getName()+":运行时间为："+useTime);
        totalTime.addAndGet(useTime);
    }

    @Override
    protected void terminated() {
        System.out.println("线程池终止");
        System.out.println("线程池中线程平均用时为："+totalTime.get()/numTask.get());
        super.terminated();

    }

    public static void main(String[] args) {
        CustomThreadPoolExecutor customThreadPoolExecutor = new CustomThreadPoolExecutor(3, 5, 3, TimeUnit.SECONDS, new LinkedBlockingQueue<>());
        for(int i=0;i<5;i++){
            customThreadPoolExecutor.execute(new Task(i));
        }
        customThreadPoolExecutor.shutdown();
    }
}
class Task implements Runnable {
    private int index;

    public Task(int index) {
        this.index = index;
    }

    @Override
    public void run() {
        System.out.println(Thread.currentThread().getName() + "：excute task" + index);
        try {
            Thread.sleep(3000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
    }
}
```

运行结果

```verilog
pool-1-thread-1start excute
pool-1-thread-3start excute
pool-1-thread-2start excute
pool-1-thread-3：excute task2
pool-1-thread-1：excute task0
pool-1-thread-2：excute task1
pool-1-thread-3:运行时间为：3005
pool-1-thread-1:运行时间为：3005
pool-1-thread-2:运行时间为：3005
pool-1-thread-1start excute
pool-1-thread-1：excute task4
pool-1-thread-3start excute
pool-1-thread-3：excute task3
pool-1-thread-1:运行时间为：3001
pool-1-thread-3:运行时间为：3001
线程池终止
线程池中线程平均用时为：3003
```



### 关闭线程池

当线程池不再被引用并且工作线程数为0的时候，线程池将被终止。我们也可以调用shutdown来手动终止线程池。如果我们忘记调用shutdown，为了让线程资源被释放，我们还可以使用keepAliveTime和allowCoreThreadTimeOut来达到目的。
- shutdown()：不会立即的终止线程池，而是要等所有任务缓存队列中的任务都执行完后才终止，但再也不会接受新的任务。

- shutdownNow()：立即终止线程池，并尝试打断正在执行的任务，并且清空任务缓存队列，返回尚未执行的任务。


## Executors四种线程池

1. Executors.newSingleThreadExecutor

   SingleThreadExecutor是单个线程的线程池，即线程池中每次只有一个线程在运行，单线程串行执行任务。如果这个唯一的线程因为异常结束，那么会有一个新的线程来替代它。

   此线程池保证任务的执行顺序按照任务的提交顺序执行。任务队列为LinkedBlockingQueue

   ```java
   public static ExecutorService newSingleThreadExecutor() {
           return new FinalizableDelegatedExecutorService
               (new ThreadPoolExecutor(1, 1,
                                       0L, TimeUnit.MILLISECONDS,
                                       new LinkedBlockingQueue<Runnable>()));
       }
   ```

2. Executors.newFixedThreadPool。

   FixedThreadPool是固定数量的线程池，只有核心线程，每提交一个任务就是一个线程，直到达到线程池的最大数量，然后后面进入等待队列，直到前面的任务完成才继续执行。线程池的大小一旦达到最大值就会保持不变，如果某个线程因为执行异常而结束，那么线程池会补充一个新线程。任务队列为LinkedBlockingQueue

   ```java
   public static ExecutorService newFixedThreadPool(int nThreads) {
           return new ThreadPoolExecutor(nThreads, nThreads,
                                         0L, TimeUnit.MILLISECONDS,
                                         new LinkedBlockingQueue<Runnable>());
   ```

3. Executors.newCachedThreadPool

   CachedThreadPool是可缓存线程池。如果线程池的大小超过了处理任务所需要的线程，那么就会回收部分空闲（60秒不执行任务）的线程，当任务数增加时，此线程池又可以智能的添加新线程来处理任务。此线程池不会对线程池大小做限制，线程池大小完全依赖于操作系统（或者说JVM）能够创建的最大线程大小。其中，SynchronousQueue是一个是缓冲区为1的阻塞队列。任务队列为SynchronousQueue

   ```java
   public static ExecutorService newCachedThreadPool() {
           return new ThreadPoolExecutor(0, Integer.MAX_VALUE,
                                         60L, TimeUnit.SECONDS,
                                         new SynchronousQueue<Runnable>());
       }
   ```

4. Executors.ScheduledThreadPool

   ScheduledThreadPool是核心线程池固定，大小无限制的线程池，支持定时和周期性的执行线程。创建一个周期性执行任务的线程池。如果闲置,非核心线程池会在`DEFAULT_KEEPALIVEMILLIS`时间内回收。任务队列为DelayedWorkQueue

   ```java
   public static ScheduledExecutorService newScheduledThreadPool(int corePoolSize) {
           return new ScheduledThreadPoolExecutor(corePoolSize);
       }
   public ScheduledThreadPoolExecutor(int corePoolSize) {
           super(corePoolSize, Integer.MAX_VALUE, 0, NANOSECONDS,
                 new DelayedWorkQueue());
       }
   /*该任务将会在首个 initialDelay 之后得到执行，然后每个 period 时间之后重复执行。period 被解释为前一个执行的开始和下一个执行的开始之间的间隔时间。如果给定任务的执行抛出了异常，该任务将不再执行。如果没有任何异常的话，这个任务将会持续循环执行到 ScheduledExecutorService 被关闭。如果一个任务占用了比计划的时间间隔更长的时候，下一次执行将在当前执行结束执行才开始。计划任务在同一时间不会有多个线程同时执行*/
   scheduleAtFixedRate (Runnable, long initialDelay, long period, TimeUnit timeunit)
   /*该方法中，period 则被解释为前一个执行的结束和下一个执行的开始之间的间隔。*/
   scheduleWithFixedDelay (Runnable, long initialDelay, long period, TimeUnit timeunit)

   ```

5. Executors.newWorkStealingPool（待整理）

  ```java
  public static ExecutorService newWorkStealingPool(int parallelism) {
      return new ForkJoinPool
          (parallelism,
           ForkJoinPool.defaultForkJoinWorkerThreadFactory,
           null, true);
  }
  ```

## 使用技巧

- 需要针对具体情况而具体处理，不同的任务类别应采用不同规模的线程池，任务类别可划分为CPU密集型任务、IO密集型任务和混合型任务。(N代表CPU个数)
- 对于CPU密集型任务：线程池中线程个数应尽量少，如配置N+1个线程的线程池；
- 对于IO密集型任务：由于IO操作速度远低于CPU速度，那么在运行这类任务时，CPU绝大多数时间处于空闲状态，那么线程池可以配置尽量多些的线程，以提高CPU利用率，如2*N；或者通过时间计算 **线程数=cpu个数 * (1+等待时间/CPU时间)** 
- 对于混合型任务：可以拆分为CPU密集型任务和IO密集型任务，当这两类任务执行时间相差无几时，通过拆分再执行的吞吐率高于串行执行的吞吐率，但若这两类任务执行时间有数据级的差距，那么没有拆分的意义。

## 参考资料

[【从0到1学习Java线程池】Java线程池原理](http://blog.luoyuanhang.com/2017/02/27/thread-pool-in-java-2/)

[Java线程池实现原理及其在美团业务中的实践](https://mp.weixin.qq.com/s?__biz=MjM5NjQ5MTI5OA==&mid=2651751537&idx=1&sn=c50a434302cc06797828782970da190e&chksm=bd125d3c8a65d42aaf58999c89b6a4749f092441335f3c96067d2d361b9af69ad4ff1b73504c&scene=21#wechat_redirect)