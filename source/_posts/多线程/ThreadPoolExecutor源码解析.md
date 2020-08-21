---
title: ThreadPoolExecutor池源码解析
date: 2017-10-25
tags:
- 多线程
- 源码解析
categories:
- java基础

---

#  ThreadPoolExecutor源码解析

## 知识导读

- ThreadPoolExecutor中定义了一个clt变量，高3位表示线程池状态，低29位表示线程数量
- Worker封装了任务和执行任务的线程，同时Worker也实现了Runnable接口，封装的线程传入的是Woker，在woker的run方法中低啊用封装的任务的run方法

## 源码待析

线程池中字段

```java

//线程池中最重要的概念，将线程池中的工作线程数量和线程池状态封装到一个int类型字段中
//前面两位字节表示状态，后面29位字节表示线程数量，最大为 (2^29)-1
private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));
private static final int COUNT_BITS = Integer.SIZE - 3;//总共有5个状态，需要3位来表示 (3=110)
private static final int CAPACITY   = (1 << COUNT_BITS) - 1;

//线程运行状态，共5个
private static final int RUNNING    = -1 << COUNT_BITS;//execute 接受新任务并且处理已经进入阻塞队列的任务
private static final int SHUTDOWN   =  0 << COUNT_BITS;//shutdown 不接受新任务，但是处理已经进入阻塞队列的任务
private static final int STOP       =  1 << COUNT_BITS;//shutdownNow 不接受新任务，不处理已经进入阻塞队列的任务并且中断正在运行的任务
private static final int TIDYING    =  2 << COUNT_BITS;//所有的任务都已经终止，workerCount为0
private static final int TERMINATED =  3 << COUNT_BITS;//terminated钩子函数已经运行完成

//从ctl获取线程池状态，ctl的前3位
private static int runStateOf(int c)     { return c & ~CAPACITY; }
//从线程池中获取线程数量，ctl的后29位
private static int workerCountOf(int c)  { return c & CAPACITY; }
//用线程池状态和线程池中线程数量获取ctl
private static int ctlOf(int rs, int wc) { return rs | wc; }

//原子WorkerCount+1
private boolean compareAndIncrementWorkerCount(int expect) {
  return ctl.compareAndSet(expect, expect + 1);
}
//原子WorkerCount-1
private boolean compareAndDecrementWorkerCount(int expect) {
  return ctl.compareAndSet(expect, expect - 1);
}
//原子WorkerCount-1，直到成功
private void decrementWorkerCount() {
  do {} while (! compareAndDecrementWorkerCount(ctl.get()));
}
//阻塞的任务队列
private final BlockingQueue<Runnable> workQueue;
//用于对主线程进行加锁，保证workers的操作线程安全
private final ReentrantLock mainLock = new ReentrantLock();
//线程池中的任务线程
private final HashSet<Worker> workers = new HashSet<Worker>();
//用于awaitTermination
private final Condition termination = mainLock.newCondition();
```

线程中任务和线程的封装Worker

```java
private final class Worker
  extends AbstractQueuedSynchronizer
        implements Runnable
    {
        private static final long serialVersionUID = 6138294804551838833L;
		//线程的封装
        final Thread thread;
        //初始化时传入的任务，线程启动时执行
        Runnable firstTask;
        //每个线程执行完的任务数量，用于获取线程池中的总任务数(+队列中的)和执行完的总任务数
        volatile long completedTasks;
        Worker(Runnable firstTask) {
            setState(-1); // inhibit interrupts until runWorker
            this.firstTask = firstTask;
            //调用线程工厂创建线程
            this.thread = getThreadFactory().newThread(this);
        }
				//run方法
        public void run() {
            runWorker(this);
        }
        protected boolean isHeldExclusively() {
            return getState() != 0;
        }
        protected boolean tryAcquire(int unused) {
            if (compareAndSetState(0, 1)) {
                setExclusiveOwnerThread(Thread.currentThread());
                return true;
            }
            return false;
        }
        protected boolean tryRelease(int unused) {
            setExclusiveOwnerThread(null);
            setState(0);
            return true;
        }
        public void lock()        { acquire(1); }
        public boolean tryLock()  { return tryAcquire(1); }
        public void unlock()      { release(1); }
        public boolean isLocked() { return isHeldExclusively(); }
        void interruptIfStarted() {
            Thread t;// AQS状态大于等于0并且worker对应的线程不为null并且该线程没有被中断
            if (getState() >= 0 && (t = thread) != null && !t.isInterrupted()) {
                try {
                    t.interrupt();
                } catch (SecurityException ignore) {
                }
            }
        }
    }
```

Worker是通过继承AQS，使用AQS来实现独占锁这个功能。没有使用可重入锁ReentrantLock，而是使用AQS，为的就是实现不可重入的特性去反应线程现在的执行状态。

1. lock方法一旦获取了独占锁，表示当前线程正在执行任务中。
2. 如果正在执行任务，则不应该中断线程。
3. 如果该线程现在不是独占锁的状态，也就是空闲的状态，说明它没有在处理任务，这时可以对该线程进行中断。
4. 线程池在执行shutdown方法或tryTerminate方法时会调用interruptIdleWorkers方法来中断空闲的线程，interruptIdleWorkers方法会使用tryLock方法来判断线程池中的线程是否是空闲状态；如果线程是空闲状态则可以安全回收。

main线程调用线程池excute()方法，首先判断线程池中的**活动线程** 数量是否小于核心数量，如果小则创建线程并执行任务；否则判断线程池状态是否是running，然后将任务添加到任务队列，添加成功后需要再次判断线程池状态，用于回滚拒绝任务；最后如果队列已满，检查线程池中数量是否小于最大配置，如果小则创建线程，否则调用拒绝策略拒绝任务。

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
    //如果线程池中没有活动线程了，创建线程，对线程池进行补偿，但是不立即执行任务
    else if (workerCountOf(recheck) == 0)
      addWorker(null, false);
  }
  //创建小于maxSize的线程并执行任务
  else if (!addWorker(command, false))
    reject(command);//失败调用拒绝策略
}
```

添加工作线程，首先双层死循环判断是否应该新建工作线程并对变量原子操作workerCount +1，循环直到成功。然后创建Work，封装工作任务和任务线程，添加成功后start任务线程

![UacXvf](https://raw.githubusercontent.com/aspiresnow/aspiresnow.github.io/hexo/source/blog_images/2020/08/UacXvf.png)

```java
private boolean addWorker(Runnable firstTask, boolean core) {
  //双层循环 增加活动线程数量WorkerCount变量
  retry:
  for (;;) {
    int c = ctl.get();
    int rs = runStateOf(c);
    //判断线程池被stop时或者shutdown并且任务队列为空则返回false，不接受新任务
    if (rs >= SHUTDOWN &&
        ! (rs == SHUTDOWN &&
           firstTask == null &&
           ! workQueue.isEmpty()))
      return false;

    for (;;) {
      int wc = workerCountOf(c);//线程池中线程数量
      //判断线程池中的线程数量是否已超过最大数或者超过核心数量配置或者超过最大数量配置
      if (wc >= CAPACITY ||
          wc >= (core ? corePoolSize : maximumPoolSize))
        return false;
      //workerCount+1  维护ctl所代表的活动线程数量
      if (compareAndIncrementWorkerCount(c))
        break retry;
      c = ctl.get();  // Re-read ctl
      //没有加成功的话并且线程池状态改变继续外层循环，重新开放校验，否则内层循环
      if (runStateOf(c) != rs)
        continue retry;
      // else CAS failed due to workerCount change; retry inner loop
    }
  }

  boolean workerStarted = false;
  boolean workerAdded = false;
  Worker w = null;
  try {
    w = new Worker(firstTask);
    final Thread t = w.thread;
    if (t != null) {
      final ReentrantLock mainLock = this.mainLock;
      //主线程加锁
      mainLock.lock();
      try {
        int rs = runStateOf(ctl.get());
		//启动工作线程前最后再次检查线程池状态
        if (rs < SHUTDOWN ||
            (rs == SHUTDOWN && firstTask == null)) {
          //检查工作线程是否存活，否则抛出异常
          if (t.isAlive()) // precheck that t is startable
            throw new IllegalThreadStateException();
          //将任务线程加入任务线程集合
          workers.add(w);
          int s = workers.size();
          //维护线程池最大线程数量
          if (s > largestPoolSize)
            largestPoolSize = s;
          workerAdded = true;
        }
      } finally {
        mainLock.unlock();
      }
      if (workerAdded) {
        //添加成功后，启动任务线程
        t.start();
        workerStarted = true;
      }
    }
  } finally {
    //失败回滚
    if (! workerStarted)
      addWorkerFailed(w);
  }
  return workerStarted;
}
```

添加任务线程失败需要回滚workerCount 数量并从任务线程集合中移除失败的work

```java
private void addWorkerFailed(Worker w) {
  final ReentrantLock mainLock = this.mainLock;
  mainLock.lock();
  try {
    if (w != null)
      //移除
      workers.remove(w);
    //减1
    decrementWorkerCount();
    tryTerminate();
  } finally {
    mainLock.unlock();
  }
}
```

线程池的任务start后，会调用runWorker方法

1. 如果当前worker配置了初始任务 firstTask，执行该任务
2. while循环不断地通过getTask()方法获取任务, 线程会阻塞在getTask()方法上
3. getTask()方法从阻塞队列中取任务。
4. 如果线程池正在停止，那么要保证当前线程是中断状态，否则要保证当前线程不是中断状态。
5. 执行任务。
6. 如果getTask结果为null则跳出循环，执行processWorkerExit()方法，销毁线程。

任务线程在执行前会调用钩子方法beforeExecute，由用户覆盖实现。直接使用当前线程调用任务的run方法，如果run异常，completedAbruptly为true，标识线程异常结束；执行完run方法后调用钩子方法afterExecute，同时将异常信息也传入该方法

```java
final void runWorker(Worker w) {
  Thread wt = Thread.currentThread();
  //取得第一个任务，并将任务线程处的任务置空
  Runnable task = w.firstTask;
  w.firstTask = null;
  // 释放锁（设置state为0，允许中断）
  w.unlock(); // allow interrupts
  boolean completedAbruptly = true;
  try {
    //任务线程要么有初始任务，要么一直循环调用getTask获取任务
    while (task != null || (task = getTask()) != null) {
      w.lock();
      //用于保证线程池正常运行情况下所有线程都没有中断状态，使用interrupted清除
      //线程池状态stop后，任务线程加上中断状态，用户可以使用isInterrupted进行判断
      if ((runStateAtLeast(ctl.get(), STOP) ||
           (Thread.interrupted() &&//interrupted会清除线程的中断状态
            runStateAtLeast(ctl.get(), STOP))) &&
          !wt.isInterrupted())
        wt.interrupt();//主线程会退出循环
      try {
        //任务执行前方法
        beforeExecute(wt, task);
        Throwable thrown = null;
        try {
          //这里使用的是run，直接调用
          task.run();
        } catch (RuntimeException x) {
          thrown = x; throw x;
        } catch (Error x) {
          thrown = x; throw x;
        } catch (Throwable x) {
          thrown = x; throw new Error(x);
        } finally {
          //任务执行后的回调
          afterExecute(task, thrown);
        }
      } finally {
        task = null;//栈中任务指针重置
        w.completedTasks++;//运行的任务+1
        w.unlock();
      }
    }
    //false任务线程正常运行结束，如果在执行中抛异常则为true，说明异常结束，会进行补偿
    completedAbruptly = false;
  } finally {
    //销毁线程
    processWorkerExit(w, completedAbruptly);
  }
}
```

当work中没有初始任务的时候，会去任务队列中获取任务，取任务的时候首先校验线程池是否停止，如果停止就停止消费，返回null，如果线程数量超过maxSize，或者核心线程允许销毁并且当前还有活动线程，则减少活动线程，并返回null，等待存活的活动线程消费任务队列，用于减少线程池中线程数量。

检验通过后去任务对列获取线程，任务对列是BlockQueue，用于阻塞线程，如果允许空闲线程销毁，调用poll(time)，经过一定时间后销毁线程，如果不允许销毁，直接调用take()方法阻塞活动线程，线程池中任务线程处于空闲状态，等待任务队列任务进行消费。

![C0qR13](https://raw.githubusercontent.com/aspiresnow/aspiresnow.github.io/hexo/source/blog_images/2020/08/C0qR13.png)

```java
private Runnable getTask() {
      boolean timedOut = false; //当poll超时会设置为true，用于下次循环减少活动线程数
      for (;;) {
          int c = ctl.get();
          int rs = runStateOf(c);
          //线程池状态为stop是停止消费，线程池状态为shutdown并且队列为空也停止消费
          if (rs >= SHUTDOWN && (rs >= STOP || workQueue.isEmpty())) {
              decrementWorkerCount();//减少线程池中一个线程个数
              return null;
          }
          int wc = workerCountOf(c);
          //在线程池中所有线程时一视同仁的，只是在保存的时候保存coreSize个
          boolean timed = allowCoreThreadTimeOut || wc > corePoolSize;
	//如果线程池中线程个数超过最大maxNum设置并且队列为空时，清空线程
          if ((wc > maximumPoolSize || (timed && timedOut))
              && (wc > 1 || workQueue.isEmpty())) {
            // do {} while (! compareAndDecrementWorkerCount(ctl.get()));
              if (compareAndDecrementWorkerCount(c))
                  return null;
              continue;//如果减少线程失败重新获取任务
          }
          try {
          //从队列中获取任务，如果队列为空 会被阻塞
              Runnable r = timed ?
                  workQueue.poll(keepAliveTime, TimeUnit.NANOSECONDS) :
                  workQueue.take();
              if (r != null)
                  return r;
              timedOut = true;//用于下次循环跳出
          } catch (InterruptedException retry) {
              timedOut = false;
          }
      }
  }
```

如果任务线程不再被任务队列阻塞同时也无法获取任务，将调用processWorkerExit销毁线程，在销毁线程的时候记录总执行的任务数

如果线程在调用run方法时抛出异常，在线程池未停止的情况下会新建线程进行补偿

在销毁线程的时候，判断线程池在未停止并且任务队列不为空的情况下的线程数量是否为0或者小于coreSize，如果是，创建新的Work线程对线程池进行补偿。

```java
private void processWorkerExit(Worker w, boolean completedAbruptly) {
  //如果任务线程异常结束，减少workerCount数量，在该线程结束时新建线程补偿线程池
  if (completedAbruptly) // If abrupt, then workerCount wasn't adjusted
    decrementWorkerCount();
  final ReentrantLock mainLock = this.mainLock;
  //使用main lock保证线程安全，用于统计任务线程的执行信息
  mainLock.lock();
  try {
    //线程池执行总任务数++
    completedTaskCount += w.completedTasks;
    //从任务线程list中移除
    workers.remove(w);
  } finally {
    mainLock.unlock();
  }
//尝试销毁线程池
  tryTerminate();

  int c = ctl.get();
  if (runStateLessThan(c, STOP)) { //判断线程池未停止
    //如果任务执行异常，对线程池进行任务线程补偿
    if (!completedAbruptly) {
      int min = allowCoreThreadTimeOut ? 0 : corePoolSize;
      //当任务队列还有任务的时候，线程数量小于coreSize，创建线程进行补偿
      if (min == 0 && ! workQueue.isEmpty())
        min = 1;
      if (workerCountOf(c) >= min)
        return; // replacement not needed
    }
    addWorker(null, false);//在addWorker中会判断数量是否超过
  }
}
```

销毁线程的过程，如果线程池状态为还可以处理任务则不处理，如果线程池需要回收线程，首先回收处于空闲状态的线程，即激活处理阻塞队列take方法的线程，让线程正常运行结束。

如果线程池中存活的线程个数为0，则关闭线程池，设置线程池状态为TIDYING，并调用钩子方法terminated，设置线程池状态为TERMINATED

```java
final void tryTerminate() {
  for (;;) {
    int c = ctl.get();
    if (isRunning(c) ||
        runStateAtLeast(c, TIDYING) ||
        (runStateOf(c) == SHUTDOWN && ! workQueue.isEmpty()))
      return;
    if (workerCountOf(c) != 0) { 
      //唤醒被队列take阻塞的线程
      interruptIdleWorkers(ONLY_ONE);
      return;
    }
	//调用shutdown方法，等待所有执行中的任务执行完毕后销毁线程池
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {//判断线程池中运行线程是否为0，任务队列为空的时候销毁线程池
      if (ctl.compareAndSet(c, ctlOf(TIDYING, 0))) {
        try {
          //调用钩子方法，线程池终止
          terminated();
        } finally {
          ctl.set(ctlOf(TERMINATED, 0));//设置线程池最终状态
          termination.signalAll();
        }
        return;
      }
    } finally {
      mainLock.unlock();
    }
  }
}
```

线程池关闭shutdown

```java
public void shutdown() {
  final ReentrantLock mainLock = this.mainLock;
  mainLock.lock();
  try {
    checkShutdownAccess();
    advanceRunState(SHUTDOWN);//设置线程池状态为 shutdown 即 0+线程数量
    interruptIdleWorkers();//中断空闲线程
    onShutdown(); // hook for ScheduledThreadPoolExecutor
  } finally {
    mainLock.unlock();
  }
  tryTerminate();//再次销毁线程，等线程数量为0时，销毁线程池
}
//中断空闲线程
private void interruptIdleWorkers(boolean onlyOne) {
  final ReentrantLock mainLock = this.mainLock;
  mainLock.lock();
  try {
    for (Worker w : workers) {
      Thread t = w.thread;
      //通过tryLock来判断当前线程是否空闲，因为活动线程无法tryLock
      if (!t.isInterrupted() && w.tryLock()) {
        try {
          t.interrupt();//会激活阻塞在队列take()方法的线程
        } catch (SecurityException ignore) {
        } finally {
          w.unlock();
        }
      }
      if (onlyOne)
        break;
    }
  } finally {
    mainLock.unlock();
  }
}
```

线程关闭shutdownNow

```java
public List<Runnable> shutdownNow() {
    List<Runnable> tasks;
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        checkShutdownAccess();
        advanceRunState(STOP);//设置状态给为stop
        interruptWorkers();//中断所有线程
        tasks = drainQueue();//返回任务队列中剩余的任务
    } finally {
        mainLock.unlock();
    }
    tryTerminate();//销毁线程池
    return tasks;
}

private void interruptWorkers() {
  final ReentrantLock mainLock = this.mainLock;
  mainLock.lock();
  try {
    for (Worker w : workers)
      w.interruptIfStarted();
  } finally {
    mainLock.unlock();
  }
}
```