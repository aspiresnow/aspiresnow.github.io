---
title: java并发之Condition
date: 2017-11-23 20:05:40
tags:
- 多线程
categories:
- java基础
---

# java并发之Condition

使用synchronize中，获取锁的线程可以调用wait放弃执行权，并且进入阻塞状态，可以通过调用notify唤醒其他阻塞在当前锁的线程。在JUC中Lock中同样提供了相似的机制，可以通过lock.newCondition创建一个Condition对象，调用condition的await和signal同样可以实现。

<!--more-->

## 实现原理

AQS中有个内部对象ConditionObject实现了Condition接口，通过ConditionObject实现阻塞和唤醒功能。

### 阻塞流程

- ConditionObject中维护一个双端等待队列，通过两个指针firstWaiter和lastWaiter引入首尾。


- 当加锁成的线程调用await方法后，会释放锁，即state-1，同时向ConditionObject中的队列中添加当前线程节点，并且设置状态为-2，然后当前线程调用park进入阻塞状态

  ```java
  public final void await() throws InterruptedException {
      if (Thread.interrupted())
          throw new InterruptedException();
      Node node = addConditionWaiter();//加入到 Condition的waiter队列中
      int savedState = fullyRelease(node);//释放Lock锁 即state-1
      int interruptMode = 0;
      while (!isOnSyncQueue(node)) {
          LockSupport.park(this);
          if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
              break;
      }
    //阻塞
      if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
          interruptMode = REINTERRUPT;
      if (node.nextWaiter != null) // clean up if cancelled
          unlinkCancelledWaiters();
      if (interruptMode != 0)
          reportInterruptAfterWait(interruptMode);
  }
  ```

### 唤醒流程

- 调用signal方法进行线程的唤醒，获取等待队列首部的节点，然后该节点尝试获取锁，将该节点加入Lock的等待队列中，同时

  ```java
  public final void signal() {
      if (!isHeldExclusively())
          throw new IllegalMonitorStateException();
      Node first = firstWaiter;//获取头节点
      if (first != null)
          doSignal(first);
  }
  ```


- 唤醒头部首个没有取消的线程

  ```java
  private void doSignal(Node first) {
      do {//移除头节点
          if ( (firstWaiter = first.nextWaiter) == null)
              lastWaiter = null;
          first.nextWaiter = null;
      } while (!transferForSignal(first) &&
               (first = firstWaiter) != null);
  }
  //signalAll其实就是将所有等待的节点顺序加入到获取Lock的队列中
  private void doSignalAll(Node first) {
    lastWaiter = firstWaiter = null;
    do {
      Node next = first.nextWaiter;
      first.nextWaiter = null;
      transferForSignal(first);
      first = next;
    } while (first != null);
  }
  ```

- 唤醒其实就是将该节点加入到获取Lock的等待队列中

  ```java
  final boolean transferForSignal(Node node) {
     //节点线程已经被取消返回false，会取下个节点
      if (!compareAndSetWaitStatus(node, Node.CONDITION, 0))
          return false;
    //将该节点加入 lock的等待队列
      Node p = enq(node);
      int ws = p.waitStatus;
    //如果状态是取消的或者设置状态失败，则激活线程，避免状态获取错误
      if (ws > 0 || !compareAndSetWaitStatus(p, ws, Node.SIGNAL))
          LockSupport.unpark(node.thread);
      return true;
  }
  ```