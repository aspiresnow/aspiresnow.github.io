---
title: java并发之AQS原理
date: 2017-10-28 23:09:44
tags:
- 多线程
categories:
- java基础
---

# java并发之AQS原理

如果说java.util.concurrent的基础是CAS的话，那么AQS就是整个Java并发包的核心了，ReentrantLock、CountDownLatch、Semaphore等都是基于AQS实现的。

AQS内部维护了一个volatile int state和一个FIFO线程等待队列，当state的值为0的时候，任意线程可以获取执行权，当存在竞争即state不为0时，将线程添加到等待队列并阻塞，等待当前占用state的线程原子减少state并激活队列头的节点线程。自定义同步器在实现时只需要实现共享资源state的获取与释放方式即可tryLock和tryRelease方法，等待队列的维护由AQS内部实现。

AQS内部对线程的阻塞依赖LockSupport.part(thread)，其功能是用来代替wait和notity/notifyall的，更好的地方是LockSupport对park方法和unpark方法的调用没有先后的限制，而notify/notifyall必须在wait调用之后调用。

<!--more-->

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/ts2.jpg?raw=true)

## AQS模式

AQS内部提供了两种实现，即独占模式和共享模式，在独占模式下只运行同时一个线程访问代码块如ReentrantLock，共享模式下允许指定多个线程同时访问代码块，如Semaphore和CountDownLatch

- 独占模式：实现类覆写以下方法
  - tryAcquire(int)：尝试获取资源，成功则返回true，失败则返回false。
  - tryRelease(int)：尝试释放资源，成功则返回true，失败则返回false。
- 共享模式：实现类覆写以下方法
  - tryAcquireShared(int)：尝试获取资源。负数表示失败；0表示成功，但没有剩余可用资源；正数表示成功，且有剩余资源。
  - tryReleaseShared(int)：尝试释放资源，如果释放后允许唤醒后续等待结点返回true，否则返回false。

## 源码分析

以ReentrantLock为例，state初始化为0，表示未锁定状态。A线程lock()时，会调用tryAcquire()独占该锁并将state+1。此后，其他线程再tryAcquire()时就会失败，直到A线程unlock()到state=0（即释放锁）为止，其它线程才有机会获取该锁。当然，释放锁之前，A线程自己是可以重复获取此锁的（state会累加），这就是可重入的概念。但要注意，获取多少次就要释放多么次，这样才能保证state是能回到零态的

### 独占锁加锁流程

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/并发/aqs2.jpg?raw=true)

- 首先AQS内部维护了一个节点类型，用于存储被阻塞的线程,内部维护了被阻塞线程的状态

     1. CANCELLED，值为1，表示当前的线程被超时取消或者中断。
2. SIGNAL，值为-1，表示当前节点的后继节点包含的线程被阻塞，当前线程执行完毕后需要对其进行unpark操作。
  3. CONDITION，值为-2，表示当前节点在等待condition，也就是在condition queue中。
4. PROPAGATE，值为-3，表示当前场景下后续的acquireShared能够得以执行。
  5. 值为0，表示当前节点在sync queue中，等待着获取锁。

  ```java
static final class Node {
      /** Marker to indicate a node is waiting in shared mode */
    static final Node SHARED = new Node();
      /** Marker to indicate a node is waiting in exclusive mode */
      static final Node EXCLUSIVE = null;
      static final int CANCELLED =  1;
      static final int SIGNAL    = -1;
      static final int CONDITION = -2;
      /** waitStatus value to indicate the next acquireShared should unconditionally propagate*/
      static final int PROPAGATE = -3;
      volatile int waitStatus;//当前被阻塞的线程的状态
      volatile Node prev;//指向上一个节点
      volatile Node next;//指向下一个节点
      volatile Thread thread;//被阻塞的线程
    	//等待condition的下一个线程
      Node nextWaiter;
      final boolean isShared() {
          return nextWaiter == SHARED;
      }
      final Node predecessor() throws NullPointerException {
          Node p = prev;
          if (p == null)
              throw new NullPointerException();
          else
              return p;
      }
  }
  ```
  
- ReetrantLock内部的Sync类继承AbstractQueuedSynchronizer，调用lock方法的时候实际上是原子性去设置state为1，成功则竞争成功，失败就加入等待队列

  ```java
   final void lock() {
     if (compareAndSetState(0, 1))//原子性设置state为1，如果成功，设置当前获取执行权的为当前线程
       setExclusiveOwnerThread(Thread.currentThread());
     else
       acquire(1);//调用AQS的acquire方法
   }
  ```
  ![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/aqs4.jpg?raw=true)

- AQS中的acquire方法，调用钩子方法tryAcquire，tryAcquire由子类覆盖实现，如果获取资源成功，则当前线程获取执行权，如果失败，调用acquireQueued将当前线程加入等待队列，设置当前为独占锁模式，并阻塞当前线程

  ```java
  public final void acquire(int arg) {
    //子类需要覆写tryAcquire方法
  	if (!tryAcquire(arg) &&acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
  		selfInterrupt();//阻塞线程无法响应中断，需要获得执行权后响应在阻塞状态下的中断信号
  }
  ```

- ReetrantLock中覆写了tryAcquire原子设置state为1，当前线程获取执行权，之后的其他访问该同步块的线程将被阻塞直到当前线程释放；如果获取资源失败，首先判断当前拥有获取资源的线程是是否为当前线程，如果是，当前线程是重入锁，只需要将state+1即可，执行线程任务；否则获取资源失败，返回false，加入等待队列

  ```java
  protected final boolean tryAcquire(int acquires) {
    return nonfairTryAcquire(acquires);//实际调用nonfairTryAcquire
  }
  final boolean nonfairTryAcquire(int acquires) {
      final Thread current = Thread.currentThread();
      int c = getState();
      if (c == 0) {//再次尝试获取资源
          if (compareAndSetState(0, acquires)) {
              setExclusiveOwnerThread(current);//如果获取资源成功，设置当前占用执行权的为当前线程
              return true;//
          }
      }
    //如果是当前线程，重入锁实现
      else if (current == getExclusiveOwnerThread()) {
          int nextc = c + acquires;
          if (nextc < 0) // overflow
              throw new Error("Maximum lock count exceeded");
          setState(nextc);
          return true;
      }
      return false;
  }
  ```

- AQS中封装的竞争失败线程的入队功能，在enq方法中，使用死循环+CAS模式保证了多线程并发模式下的成功入队，每次能够保证只有一个成功，如果失败下次重试，如果是N个线程，那么每个线程最多loop N次，最终都能够成功。**在这里最终无法保证线程的公平入队，出队能够保证FIFO。**

  ```Java
  private Node addWaiter(Node mode) {
      Node node = new Node(Thread.currentThread(), mode);
      // Try the fast path of enq; backup to full enq on failure
      Node pred = tail;
    	//节点已经初始化
      if (pred != null) {
        //尝试将节点加到队尾，在无竞争情况下保证会成功返回，如果失败再调用enq方法，循环尝试
          node.prev = pred;
          if (compareAndSetTail(pred, node)) {
              pred.next = node;
              return node;
          }
      }
      enq(node);//尾结点为空(即还没有被初始化过)，或者是compareAndSetTail操作失败，则入队列
      return node;
  }
  //将节点添加到队列的尾部
  private Node enq(final Node node) {
    for (;;) {//死循环进行CAS操作，直到成功返回
      Node t = tail;
      if (t == null) { // 当队列为空时init空节点
        if (compareAndSetHead(new Node()))//头节点为空
          tail = head;
      } else {
        node.prev = t;
        //尝试将节点加到队尾，如果失败在循环重试，多线程并发，无法保证线程的入队顺序
        if (compareAndSetTail(t, node)) {
          t.next = node;
          //返回队尾节点
          return t;
        }
      }
    }
  }
  //
  private final boolean compareAndSetTail(Node expect, Node update) {
    return unsafe.compareAndSwapObject(this, tailOffset, expect, update);
  }
  ```

- 线程已经加入等待队列，并返回所处队列的节点node，**当前线程进入阻塞状态，直到其他线程释放资源后唤醒自己，然后在获取CPU执行权**，在死循环中CAS获取资源直到成功移除等待队列中获取资源的节点，线程获取执行权并返回中断标识，

  ```java
  final boolean acquireQueued(final Node node, int arg) {
      boolean failed = true;
      try {
          boolean interrupted = false;//中断标识
        //自旋  当线程从阻塞状态被唤醒后再次循环获取资源，如果是interrupt唤醒，循环再次获取锁
          for (;;) {
              final Node p = node.predecessor();//获取前一个节点
              //如果前一个节点已经是head(空的节点)，当前节点已经是排队中的第一个，则尝试去获取资源
              if (p == head && tryAcquire(arg)) {
                  setHead(node);//加锁成功后将从队列中移除当前节点，保证head节点为空的
                  //从头开始删除链表节点
                  p.next = null; // help GC
                  failed = false;
                  return interrupted;//获得资源，当前线程获取执行权
              }
              //在阻塞线程之前判断线程状态是否适合阻塞
              if (shouldParkAfterFailedAcquire(p, node) && parkAndCheckInterrupt())
                  interrupted = true;
          }
      } finally {
          if (failed)
              cancelAcquire(node);
      }
  }
  //链表中移除当前节点
  private void setHead(Node node) {
    head = node;
    node.thread = null;
    node.prev = null;
  }
  ```
  在线程阻塞之前调用shouldParkAfterFailedAcquire方法检查线程状态是否应该阻塞，避免队列中其他线程已经都被取消，当前线程无效等待

- 只有当前节点前面的节点状态是SIGNAL的，这样当前一个节点释放资源后才能通知唤醒后一个等待的节点。所以当前线程在被阻塞前，需要保证前一个节点的状态为SIGNAL，如果已是取消状态，则从队列中移除，

  ```java
  private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
      int ws = pred.waitStatus;//获取前一个节点的状态
      if (ws == Node.SIGNAL)//如果前一个节点状态已经为SIGNAL，则当前线程可以被阻塞了
          return true;
      if (ws > 0) {
          do {//如果前一个节点已经被取消，从等待队列中移除已被取消的节点  循环操作，跳过被取消的线程
              node.prev = pred = pred.prev;
          } while (pred.waitStatus > 0);
          pred.next = node;
      } else {
        //为PROPAGATE -3 或者是0 表示无状态,(为CONDITION -2时，表示此节点在condition queue中)
        //比较并设置其状态为SIGNAL，通知他在释放资源后激活自己，如果失败 继续在acquireQueued循环
          compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
      }
      return false;
  }
  ```

- 调用LockSupport.park(thread)阻塞线程，直到获得执行权的线程调用unpark(thread)激活当前线程，再次尝试去获取资源，等待线程被激活的顺序是遵从队列的FIFO原则的，无法达到公平锁是因为入队的顺序无法保证

  当线程被激活后，返回中断信号，用于响应在阻塞状态下无法响应的中断信号，如果阻塞期间被中断过则会调用selfInterrupt()方法，执行当前线程interrupt()

  ```java
  private final boolean parkAndCheckInterrupt() {
      LockSupport.park(this);//当前线程被阻塞在该位置
      return Thread.interrupted();//当前线程是否已被中断，并清除中断标记位，防止再次park时失效
  }
  static void selfInterrupt() {
    Thread.currentThread().interrupt();//当前线程发出中断信号
  }
  ```

- 总结 

  acquireQueued()方法总结

  1. 结点进入队尾后，检查状态，找到安全休息点；
  2. 调用park()进入waiting状态，等待unpark()或interrupt()唤醒自己；
  3. 被唤醒后，循环再次获取资源。如果拿到，head出队，将head指向当前结点，并返回从入队到拿到号的整个过程中是否被中断过的信号；如果没拿到，继续流程1。

  acquire()方法总结

  1. 调用自定义同步器的tryAcquire()尝试直接去获取资源，如果成功则直接返回；

  2. 没成功，则addWaiter()将该线程加入等待队列的尾部，并标记为独占模式；

  3. acquireQueued()使线程在等待队列中休息，有机会时（轮到自己，会被unpark()）会去尝试获取资源。获取到资源后才返回。如果在整个等待过程中被中断过，则返回true，否则返回false。

  4. 如果线程在等待过程中被中断过，它是不响应的。只是获取资源后才再进行自我中断selfInterrupt()，将中断补上。

     ![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/aqs3.jpg?raw=true)

### 独占锁释放锁流程

独占锁的释放主要是将共享资源从n减到0，然后激活等待队列中的头部节点，在激活的时候只激活一个，并且是等待队列的头部，避免了notify的随机激活(不可控制)和notifyAll激活所有(CPU竞争)，

- ReetrantLock中的unlock方法实际调用的Sync类继承的AQS的realse方法，每次unlock是对state进行原子减1

  ```java
  public void unlock() {
    sync.release(1);//调用AQS的release方法操作state
  }
  ```

- AQS中的realse调用tryRealse操作state，tryRealse用于减state的值，是AQS中定义的钩子方法，由子类覆盖实现，当state减为0的时候尝试唤醒等待队列中头部节点

  ```java
  public final boolean release(int arg) {
      if (tryRelease(arg)) {//先将status减去
          Node h = head;
        //当state减为0的时候尝试唤醒等待队列中头部节点
          if (h != null && h.waitStatus != 0)//
              unparkSuccessor(h);
          return true;
      }
      return false;
  }
  ```

- 在Sync中实现了tryRelease方法,在realse的时候已经保证了当前只有一个线程，不会有并发问题，所以只需要将state-1就行，重入多少次则需要release多少次，当state减为0的时候表示不再占用资源，将独占资源的线程设置为null，并且调用unpark唤醒等待队列中的第一个阻塞线程。

  ```Java
  protected final boolean tryRelease(int releases) {
      int c = getState() - releases;
      if (Thread.currentThread() != getExclusiveOwnerThread())
          throw new IllegalMonitorStateException();
      boolean free = false;
      if (c == 0) {
          free = true;
          setExclusiveOwnerThread(null);
      }
      setState(c);
      return free;
  }
  ```

- **用unpark()唤醒等待队列中最前边的那个未放弃线程**，即状态为SIGNAL 的节点。

  ```java
  private void unparkSuccessor(Node node) {
      /*
       * If status is negative (i.e., possibly needing signal) try
       * to clear in anticipation of signalling.  It is OK if this
       * fails or if status is changed by waiting thread.
       */
      int ws = node.waitStatus;
      if (ws < 0)//状态值小于0，为SIGNAL -1 或 CONDITION -2 或 PROPAGATE -3
          compareAndSetWaitStatus(node, ws, 0);

      Node s = node.next;
      if (s == null || s.waitStatus > 0) {//如果下一个节点为空或者取消，则找队列中下一个不为空并未取消的节点
          s = null;//从后往前找到最前面未被取消的节点
          for (Node t = tail; t != null && t != node; t = t.prev)
              if (t.waitStatus <= 0)
                  s = t;
      }
      if (s != null)
          LockSupport.unpark(s.thread);//唤醒
  }
  ```

### 共享锁加锁流程

以CountDownLatch以例，任务分为n个子线程去执行，state也初始化为n（注意N要与线程个数一致）。这N个子线程是并行执行的，每个子线程执行完后countDown()一次，state会CAS减1。等到所有子线程都执行完后(即state=0)，会unpark()主调用线程，然后主调用线程就会从await()函数返回，继续后余动作。

- 共享模式下调用的是tryAcquireShared

- 内部调用doAcquireShared

- 在当前节点被唤醒的时候，需要传播性的唤醒队列中的下一个节点

  ```java
  private void doAcquireShared(int arg) {
  final Node node = addWaiter(Node.SHARED); //指定node节点模式，比独享锁多了一个nextWaiter
  boolean failed = true;
  try {
      boolean interrupted = false;
      for (;;) {
          final Node p = node.predecessor();//获取前一个节点
          if (p == head) {//如果前一个节点是head，head是当前获取资源在运行的线程，自己是最可能拿到资源
              int r = tryAcquireShared(arg);//尝试获取资源
              if (r >= 0) {//如果成功
                  setHeadAndPropagate(node, r);//将head指向自己，如果state不为0 再次唤醒队列中下一个
                  p.next = null; // help GC
                  if (interrupted)//如果等待过程有收到中断，补上中断标记
                      selfInterrupt();
                  failed = false;
                  return;
              }
          }
        //如果获取不到资源，寻找安全点，阻塞，等待获取资源的线程调用unpark 唤醒
          if (shouldParkAfterFailedAcquire(p, node) &&
              parkAndCheckInterrupt())
              interrupted = true;
      }
  } finally {
      if (failed)
          cancelAcquire(node);
  }
  }
  ```


- 自己被唤醒后，判断资源是否有空余，如果有则唤醒队列中自己下一个节点线程

  ```java
  private void setHeadAndPropagate(Node node, int propagate) {
      Node h = head; // Record old head for check below
      setHead(node);//head指向当前节点
      //如果还有剩余量，继续唤醒下一个邻居线程
      if (propagate > 0 || h == null || h.waitStatus < 0 ||
          (h = head) == null || h.waitStatus < 0) {
          Node s = node.next;
          if (s == null || s.isShared())
              doReleaseShared();
      }
  }
  ```

### 共享锁释放锁流程

- 释放锁就是由子类实现去改变state数量，然后在AQS中去唤醒等待队列中的头部节点

  ```java
  public final boolean releaseShared(int arg) {
      if (tryReleaseShared(arg)) {//操作state并判断是否需要激活等待队列头部节点
          doReleaseShared();
          return true;
      }
      return false;
  }
  ```

- fff

  ```java
  private void doReleaseShared() {
      
      for (;;) {
          Node h = head;
          if (h != null && h != tail) {//等待队列存在等待线程
              int ws = h.waitStatus;
              if (ws == Node.SIGNAL) {//需要保证将清除节点状态，失败则for循环中重新校验
                  if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                      continue;            // loop to recheck cases
                  unparkSuccessor(h);//激活下一个节点
              }
              else if (ws == 0 &&
                       !compareAndSetWaitStatus(h, 0, Node.PROPAGATE))//设置为-3，在下次
                  continue;                // loop on failed CAS
          }
          if (h == head) //如果
              break;
      }
  }
  ```

## 其他方法

- 可中断锁

  ```java
  private void doAcquireInterruptibly(int arg)
      throws InterruptedException {
      final Node node = addWaiter(Node.EXCLUSIVE);//入等待队列
      boolean failed = true;
      try {
          for (;;) {
              final Node p = node.predecessor();
              if (p == head && tryAcquire(arg)) {
                  setHead(node);
                  p.next = null; // help GC
                  failed = false;
                  return;
              }
              if (shouldParkAfterFailedAcquire(p, node) &&
                  parkAndCheckInterrupt())
                //如果是中断唤醒线程 则抛出异常
                  throw new InterruptedException();
          }
      } finally {
          if (failed) //如果中断 设置节点状态为取消 ，并unpark队列中的线程
              cancelAcquire(node);
      }
  }
  ```

- 超时获取锁

  ```java
  private boolean doAcquireNanos(int arg, long nanosTimeout)
          throws InterruptedException {
      if (nanosTimeout <= 0L)
          return false;
      final long deadline = System.nanoTime() + nanosTimeout;
      final Node node = addWaiter(Node.EXCLUSIVE);//入等待队列
      boolean failed = true;
      try {
          for (;;) {
              final Node p = node.predecessor();
              if (p == head && tryAcquire(arg)) {
                  setHead(node);
                  p.next = null; // help GC
                  failed = false;
                  return true;
              }
              nanosTimeout = deadline - System.nanoTime();
              if (nanosTimeout <= 0L)//等待够时间后直接返回false
                  return false;
            //自旋够设置时间后 阻塞一段时间
              if (shouldParkAfterFailedAcquire(p, node) &&
                  nanosTimeout > spinForTimeoutThreshold)
                  LockSupport.parkNanos(this, nanosTimeout);
              if (Thread.interrupted())
                  throw new InterruptedException();
          }
      } finally {
          if (failed)
              cancelAcquire(node);
      }
  }
  ```

- 设置为取消状态

  ```java
  private void cancelAcquire(Node node) {
      // Ignore if node doesn't exist
      if (node == null)
          return;
      node.thread = null;
      // Skip cancelled predecessors
      Node pred = node.prev;
      while (pred.waitStatus > 0)
          node.prev = pred = pred.prev;

      // predNext is the apparent node to unsplice. CASes below will
      // fail if not, in which case, we lost race vs another cancel
      // or signal, so no further action is necessary.
      Node predNext = pred.next;
      //设置为取消状态
      node.waitStatus = Node.CANCELLED;
      //如果当前节点为队尾，直接移除
      if (node == tail && compareAndSetTail(node, pred)) {
          compareAndSetNext(pred, predNext, null);
      } else {
          // If successor needs signal, try to set pred's next-link
          // so it will get one. Otherwise wake it up to propagate.
          int ws;
          if (pred != head &&
              ((ws = pred.waitStatus) == Node.SIGNAL ||
               (ws <= 0 && compareAndSetWaitStatus(pred, ws, Node.SIGNAL))) &&
              pred.thread != null) {
              Node next = node.next;
              if (next != null && next.waitStatus <= 0)
                  compareAndSetNext(pred, predNext, next);
          } else {
              unparkSuccessor(node);
          }
          node.next = node; // help GC
      }
  }
  ```