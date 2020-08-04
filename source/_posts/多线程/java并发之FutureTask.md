---
title: java并发之FutureTask
date: 2020-08-03
tags:
- 多线程
categories:
- java基础
---

# java并发之FutureTask

## 知识导读

- FutureTask实现了Runable接口，是一个可执行的任务
- FutureTask封装了Callable实例、运行任务的线程、阻塞等待任务线程运行结果的等待队列
- FutureTask执行时，run方法中会记录任务线程，调用Callable实例的方法并将结果set到FutureTask的变量上。最后激活等待任务结果的线程
- 其他线程调用FutureTask.get() 会将当前线程添加FutureTask的等待队列并阻塞。
- 任务线程执行完毕后唤醒等待队列中所有线程，然后被唤醒的线程从FutureTask的outcome变量获取结果
- 线程的阻塞和唤醒基于LockSupport.park和unpark

## 基本原理

FutureTask实现了Future接口和Runable接口，是一个可执行的任务，同时可以阻塞获取任务执行结果。

1. JVM中定义了Callable接口，声明一个可以获取接口的任务，Future在构造器中声明封装一个Callable实例
2. 调用Future接口的get方法需要阻塞当前线程等待任务结果。FutureTask中封装了一个等待队列，当某线程调用get方法后，会将该线程添加到等待队列，并调用LockSupport.park阻塞当前线程
3. FutureTask执行时，run方法中会调用Callable实例获取任务结果完成后记录该结果，run方法执行完毕后唤醒等待队列中所有阻塞线程
4. 等待队列中的线程被唤醒后会去FutureTask中获取任务执行结果

## 源码分析

### 继承结构

JVM中定义了Future接口，声明了阻塞获取任务执行结果的方法

```java
public interface Future<V> {
    //取消任务线程，如果任务已经执行完毕或者已经被取消，则取消失败
    boolean cancel(boolean mayInterruptIfRunning);
    //判断Future任务线程是否在执行完毕前已被取消
    boolean isCancelled();
    //判断Future任务线程是否执行完毕
    boolean isDone();
    //当前线程等待 Future任务线程执行完毕并获取返回结果
    V get() throws InterruptedException, ExecutionException;
    //带超时等待获取任务线程执行结果
    V get(long timeout, TimeUnit unit)
        throws InterruptedException, ExecutionException, TimeoutException;
}
```

RunnableFuture桥接了Runable接口和Future接口

```java
public interface RunnableFuture<V> extends Runnable, Future<V> {
    void run();
}
```

FutureTask实现了RunnableFuture接口，可以说FutureTask就是一个任务。同时FutureTask还封装了特定一些东西

1. state: 用于标记FutureTask的任务状态
   1. NEW ： FutureTask任务还未被运行，未调用start方法
   2. COMPLETING: FutureTask将要结束
   3. NORMAL： FutureTask中的Callable实例正常执行完毕，并已经记录下运行结果，终态
   4. EXCEPTIONAL:  FutureTask运行异常
   5. CANCELLED：FutureTask在运行结束前被取消
   6. INTERRUPTING：FutureTask正在被打断
   7. INTERRUPTED：FutureTask被打断结束
2. Callable实例: 一个带返回值的任务
3. outcome(Object)：Callable实例执行完毕后的执行结果
4. runner(Thread): 用于执行FutureTask任务的线程
5. waiters(WaitNode): 当前正在阻塞等待FutureTask任务执行结果的阻塞线程队列

```java
public class FutureTask<V> implements RunnableFuture<V> {
  private volatile int state;
  private Callable<V> callable;
  private Object outcome;
  private volatile Thread runner;
  private volatile WaitNode waiters;
  public FutureTask(Callable<V> callable) {
    if (callable == null)
      throw new NullPointerException();
    this.callable = callable;
    this.state = NEW;  
  }
  public FutureTask(Runnable runnable, V result) {
    this.callable = Executors.callable(runnable, result);
    this.state = NEW;       // ensure visibility of callable
  }
}
```

Executors.callable将Runnable实例适配为Callable实例

```java
public static <T> Callable<T> callable(Runnable task, T result) {
    if (task == null)
        throw new NullPointerException();
    return new RunnableAdapter<T>(task, result);
}
```

RunnableAdapter将一个Runnable实例适配为一个Callable实例。Runable执行完毕后，返回默认值result

```java
static final class RunnableAdapter<T> implements Callable<T> {
    final Runnable task;
    final T result;
    RunnableAdapter(Runnable task, T result) {
        this.task = task;
        this.result = result;
    }
    public T call() {
        task.run();
        return result;
    }
}
```

等待队列WaitNode封装了阻塞等待的线程

```java
static final class WaitNode {
    volatile Thread thread;
    volatile WaitNode next;
    WaitNode() { thread = Thread.currentThread(); }
}
```

### 任务执行

执行的时候就可以人为FutureTask就是一个Runable，通过构造器创建了一个带Callable实例的FutureTask。当一个线程执行start方法运行FutureTask任务，调用FutureTask的run方法

1. 使用runner变量记录运行FutureTask任务的线程
2. 调用callable实例的call方法，执行被封装的任务，获取执行结果，并记录任务是否成功执行
3. FutureTask任务执行成功后
   1. CAS将FutureTask的state状态从New更新为COMPLETING，标记任务正在完成
   2. 使用FutureTask的变量outcome接收Callable执行结果
   3. CAS将FutureTask的state状态更新为NORMAL，表示任务执行成功，终态
   4. 唤醒所有阻塞等待FutureTask任务执行结果的线程

```java
public void run() {
    //CAS为runner赋值为当前执行任务的线程，同时避免并发重复执行run方法成功
    if (state != NEW ||
        !UNSAFE.compareAndSwapObject(this, runnerOffset,
                                     null, Thread.currentThread()))
        return;
    try {
        Callable<V> c = callable;
        //只有state状态为NEW时执行callable任务
        if (c != null && state == NEW) {
            V result;
            boolean ran;
            try {
                result = c.call();//执行封装的Callable任务
                ran = true; //标记任务执行成功
            } catch (Throwable ex) {
                result = null;
                ran = false;  //标记任务执行失败
                setException(ex);
            }
            if (ran)//任务执行成功后，outcome接收任务执行结果，通知更改FutureTask的状态，唤醒等待线程
                set(result);
        }
    } finally {
        //将执行任务线程重置，避免并发重复调用run
        runner = null;
        int s = state;
        if (s >= INTERRUPTING)
            handlePossibleCancellationInterrupt(s);
    }
}
```

调用set方法处理任务执行成功后的事项

```java
protected void set(V v) {
    if (UNSAFE.compareAndSwapInt(this, stateOffset, NEW, COMPLETING)) {
        outcome = v;
        UNSAFE.putOrderedInt(this, stateOffset, NORMAL); // final state
        finishCompletion();
    }
}
```

在finishCompletion方法中使用LockSupport.unpark 循环唤醒等待队列中所有的等待线程

```java
private void finishCompletion() {
    // assert state > COMPLETING;
    for (WaitNode q; (q = waiters) != null;) {
        if (UNSAFE.compareAndSwapObject(this, waitersOffset, q, null)) {
            for (;;) {
                Thread t = q.thread;
                //只激活存在线程的节点
                if (t != null) {
                    q.thread = null;
                    LockSupport.unpark(t);
                }
                WaitNode next = q.next;
                if (next == null)
                    break;
                q.next = null; // unlink to help gc
                q = next;
            }
            break;
        }
    }
    //钩子方法，子类实现后可以记录任务执行成功的事件
    done();
    callable = null;        // to reduce footprint
}
```

### 获取FutureTask任务执行结果

调用FutureTask的get方法会阻塞当前线程，等待FutureTask任务执行完毕后获取结果，然后当前线程才会被唤醒

1. 当前线程阻塞，并添加到FutureTask的等待队列
2. 当线程被唤醒后，返回FutureTask执行结果

```java
public V get() throws InterruptedException, ExecutionException {
    int s = state;
    if (s <= COMPLETING)
        s = awaitDone(false, 0L);
    return report(s);
}
```

调用awaitDone阻塞当前线程，这段代码感觉有点丑陋，不同流程的逻辑放到一起elseif。

1. 创建WaitNode封装当前线程
2. 将WaitNode节点添加到等待队列尾部
3. 使用LockSupport.park阻塞当前线程
4. 线程被唤醒，返回FutureTask状态
   1. 被interrupted，将WaitNode从队列移除，然后抛出InterruptedException
   2. 被unpark正常唤醒，判断FutureTask的state状态，如果是终态，清除WaitNode的Thread，然后返回FutureTask的state状态
   3. 阻塞超时时间到了被唤醒，将WaitNode从队列移除，然后返回FutureTask的state状态，这时可能获取不到任务执行结果

```java
private int awaitDone(boolean timed, long nanos)
    throws InterruptedException {
    final long deadline = timed ? System.nanoTime() + nanos : 0L;
    WaitNode q = null;
    boolean queued = false;
    for (;;) {
        if (Thread.interrupted()) {
            removeWaiter(q);
            throw new InterruptedException();
        }

        int s = state;
        if (s > COMPLETING) {
            if (q != null)
                q.thread = null;
            return s;
        }
        else if (s == COMPLETING) //COMPLETING状态则稍等以下，马上就好，所以不进行阻塞
            Thread.yield();
        else if (q == null)
            q = new WaitNode(); //将当前线程封装为 WaitNode
        else if (!queued)
            queued = UNSAFE.compareAndSwapObject(this, waitersOffset,
                                                 q.next = waiters, q);
        else if (timed) {
            nanos = deadline - System.nanoTime();
            if (nanos <= 0L) {
                removeWaiter(q);
                return state;
            }
            LockSupport.parkNanos(this, nanos);
        }
        else
            LockSupport.park(this);
    }
}
```

线程被唤醒后继续执行report方法，FutureTask中的outcome值记录了Callable实例的执行结果，获取该值。当任务是CANCELLED状态时抛出异常

```java
private V report(int s) throws ExecutionException {
    Object x = outcome;
    if (s == NORMAL)
        return (V)x;
    if (s >= CANCELLED)
        throw new CancellationException();
    throw new ExecutionException((Throwable)x);
}
```

### 任务取消

只有NEW状态的FutureTask可以取消，将状态更新为CANCELLED或者INTERRUPTING

1. FutureTask中使用变量runner记录了工作线程，调用interrupt发出中断信号
2. CAS更新FutureTask的状态为INTERRUPTED
3. 在finnaly方法调用finishCompletion方法唤醒等待该任务的线程

```java
public boolean cancel(boolean mayInterruptIfRunning) {
    if (!(state == NEW &&
          UNSAFE.compareAndSwapInt(this, stateOffset, NEW,
              mayInterruptIfRunning ? INTERRUPTING : CANCELLED)))
        return false;
    try {    // in case call to interrupt throws exception
        if (mayInterruptIfRunning) {
            try {
                Thread t = runner;
                if (t != null)
                    t.interrupt();
            } finally { // final state
                UNSAFE.putOrderedInt(this, stateOffset, INTERRUPTED);
            }
        }
    } finally {
        finishCompletion();
    }
    return true;
}
```