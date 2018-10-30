---
title: java并发之CountDownLatch
date: 2017-11-21 15:11:30
tags:
- 多线程
categories:
- java基础

---

# java并发之CountDownLatch

当创建一个 new CountDownLatch(n)的时候相当执行了n次lock.lock()，将AQS的state设置为n，对资源重入了n次，后面每次执行await相当于去获取这个锁的资源，都会被阻塞，除非state减为0。

调用countDown就是讲state减1，需要执行n次countDown才能释放资源。当state减为0的时候唤醒等待队列头的线程，被唤醒的线程会传播试的唤醒队列中下一个线程

<!--more-->

## 用法

```java
public class CountdownLatchTest {
  public static void main(String[] args) {
    ExecutorService service = Executors.newCachedThreadPool();
    final CountDownLatch cdOrder = new CountDownLatch(1);
    final CountDownLatch cdAnswer = new CountDownLatch(3);		
    for(int i=0;i<3;i++){
      Runnable runnable = new Runnable(){
        public void run(){
          try {
            System.out.println("线程" + Thread.currentThread().getName() + 
                               "正准备接受命令");						
            cdOrder.await();
            System.out.println("线程" + Thread.currentThread().getName() + 
                               "已接受命令");								
            Thread.sleep((long)(Math.random()*10000));	
            System.out.println("线程" + Thread.currentThread().getName() + 
                               "回应命令处理结果");						
            cdAnswer.countDown();						
          } catch (Exception e) {
            e.printStackTrace();
          }				
        }
      };
      service.execute(runnable);
    }		
    try {
      Thread.sleep((long)(Math.random()*10000));

      System.out.println("线程" + Thread.currentThread().getName() + 
                         "即将发布命令");						
      cdOrder.countDown();
      System.out.println("线程" + Thread.currentThread().getName() + 
                         "已发送命令，正在等待结果");	
      cdAnswer.await();
      System.out.println("线程" + Thread.currentThread().getName() + 
                         "已收到所有响应结果");	
    } catch (Exception e) {
      e.printStackTrace();
    }				
    service.shutdown();

  }
}
/*
线程pool-1-thread-2正准备接受命令
线程pool-1-thread-1正准备接受命令
线程pool-1-thread-3正准备接受命令
线程main即将发布命令
线程main已发送命令，正在等待结果
线程pool-1-thread-2已接受命令
线程pool-1-thread-1已接受命令
线程pool-1-thread-3已接受命令
线程pool-1-thread-3回应命令处理结果
线程pool-1-thread-1回应命令处理结果
线程pool-1-thread-2回应命令处理结果
线程main已收到所有响应结果
*/
```
## 源码分析

- 构造方法需要传递一个int类型的数，用于设置同时运行的线程的梳理

  ```java
  public CountDownLatch(int count) {
      if (count < 0) throw new IllegalArgumentException("count < 0");
      this.sync = new Sync(count);
  }
  ```


- CountDownLatch基于内部类Sync，Sync继承了AQS，是AQS的共享模式的一种实现

  ```java
  private static final class Sync extends AbstractQueuedSynchronizer {
      private static final long serialVersionUID = 4982264981922014374L;
      Sync(int count) {
          setState(count);
      }
      int getCount() {
          return getState();
      }
      protected int tryAcquireShared(int acquires) {
        //当state不为0的时候，线程无法获取到锁，返回-1
        //当阻塞的线程可以获取锁，则返回1，可以唤醒阻塞的线程
          return (getState() == 0) ? 1 : -1;
      }
      protected boolean tryReleaseShared(int releases) {
          // Decrement count; signal when transition to zero
          for (;;) {
              int c = getState();
              if (c == 0)
                  return false;
              int nextc = c-1;
              if (compareAndSetState(c, nextc))
                  return nextc == 0;
          }
      }
  }
  ```

- 获取共享锁资源

  ```java
  //获取一个资源，允许中断
  public void await() throws InterruptedException {
      sync.acquireSharedInterruptibly(1);//可中断模式获取1个资源
  }
  //设置等待超时时间
  public boolean await(long timeout, TimeUnit unit) throws InterruptedException {
     return sync.tryAcquireSharedNanos(1, unit.toNanos(timeout));//可中断模式获取1个资源
  }
  ```

- 调用AQS中获取锁资源

  ```java
  public final void acquireSharedInterruptibly(int arg) throws InterruptedException {
      if (Thread.interrupted())//中断直接抛出异常
          throw new InterruptedException();
      if (tryAcquireShared(arg) < 0)//如果无法获取到资源，添加到等待队列等待
          doAcquireSharedInterruptibly(arg);
  }
  ```

- 获取锁资源，当前线程节点加入等待队列，再次尝试获取锁资源，如果获取成功 state-1，否则当前线程进入阻塞状态，当线程激活后，会尝试激活下一个节点，传播激活，直到激活队列中所有的线程

  ```java
  private void doAcquireSharedInterruptibly(int arg)throws InterruptedException {
      final Node node = addWaiter(Node.SHARED);//加入等待队列 并指定nextWaiter
      boolean failed = true;
      try {
          for (;;) {
              final Node p = node.predecessor();
              if (p == head) {
                  int r = tryAcquireShared(arg);
                  if (r >= 0) {
                      setHeadAndPropagate(node, r);//激活下一个节点
                      p.next = null; // help GC
                      failed = false;
                      return;
                  }
              }
              if (shouldParkAfterFailedAcquire(p, node) &&
                  parkAndCheckInterrupt())
                  throw new InterruptedException();
          }
      } finally {
          if (failed)
              cancelAcquire(node);
      }
  }
  ```

- 激活等待队列中的下一个节点

  ```java
  private void setHeadAndPropagate(Node node, int propagate) {
      Node h = head; // Record old head for check below
      setHead(node);
      //判断锁状态
      if (propagate > 0 || h == null || h.waitStatus < 0 ||
          (h = head) == null || h.waitStatus < 0) {
          Node s = node.next;
          if (s == null || s.isShared())//如果节点是 共享模式
              doReleaseShared();//唤醒下一个节点
      }
  }
  ```

- 调用countDown方法释放锁资源

  ```java
  public void countDown() {
      sync.releaseShared(1);
  }
  ```

- 调用继承自AQS的 releaseShared方法， 用于释放共享锁资源

  ```java
  public final boolean releaseShared(int arg) {
      if (tryReleaseShared(arg)) {//回调CountDownLatch中的实现
          doReleaseShared();
          return true;
      }
      return false;
  }
  //Sync中的实现 将state-1
  protected boolean tryReleaseShared(int releases) {
    // Decrement count; signal when transition to zero
    for (;;) {
      int c = getState();
      if (c == 0)//已经为0 不需要再次减
        return false;
      int nextc = c-1;
      if (compareAndSetState(c, nextc))
        return nextc == 0;
    }
  }
  ```

- 等待队列出队，激活队列头部线程

  ```java
  private void doReleaseShared() {
     //循环激活
      for (;;) {
          Node h = head;
          if (h != null && h != tail) {
              int ws = h.waitStatus;
              if (ws == Node.SIGNAL) {
                  if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                      continue;            // loop to recheck cases
                  unparkSuccessor(h);//激活队列头线程
              }//当ws无状态的时候，设置为-3，代表当前运行的时候要激活队列中的下一个
              else if (ws == 0 && !compareAndSetWaitStatus(h, 0, Node.PROPAGATE))
                  continue;               
          }
          if (h == head)   //激活队列头的线程后 跳出循环                
              break;
      }
  }
  ```

- 激活队列中的线程

  ```java
  private void unparkSuccessor(Node node) {
     
      int ws = node.waitStatus;
    //当前节点的线程已经运行完毕，并完成下一个节点的激活任务，将状态设置为0
      if (ws < 0)
          compareAndSetWaitStatus(node, ws, 0);

      Node s = node.next;
      //只激活节点状态不是取消的 取消的状态为1
      if (s == null || s.waitStatus > 0) {
          s = null;
          for (Node t = tail; t != null && t != node; t = t.prev)
              if (t.waitStatus <= 0)
                  s = t;
      }
      if (s != null)
          LockSupport.unpark(s.thread);
  }
  ```



