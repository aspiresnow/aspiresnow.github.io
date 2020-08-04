---
title: java并发之AQS原理
date: 2017-10-28 23:09:44
tags:
- 多线程
categories:
- java基础
---

# java并发之AQS原理

## 知识导读

- AQS定义了同步队列+阻塞线程+唤醒线程的基本实现。是否该阻塞(tryAcquire)和释放资源(tryRelease)由具体子类实现具体逻辑，在AQS中只关心子类实现的结果
- AQS中定义了一个volatile修饰的int类型state变量，保证了多线程内存可见性，线程通过操作和判断state值来决定是否能成功获取同步状态
- AQS的实质是使用带有虚拟头节点的双向队列存储获取同步状态失败的线程，被唤醒后自旋获取同步状态，线程通过park方法阻塞。
- 一个park后的线程被激活有三种情况
  - 其他线程调用unpark
  - 该线程被interrupt
  - 该线程park时间到了自动激活
- 每个获取执行权限成功的线程在执行完毕释放资源后，会调用unpark唤醒AQS队列中第一个有效的被阻塞的线程
- 在调用park阻塞当前线程之前，一定要保证当前节点的前驱节点状态为SINGAL，因为park阻塞的线程需要其他线程显示调用unpark唤醒，所以标记前驱节点为SINGNAL保证前驱节点执行完毕后唤醒后继节点的线程
- 每个Condition对象对应一个双端双向等待队列。当线程await之后会被阻塞并添加到Condition等待队列尾部。然后线程被唤醒后会自旋判断当前节点是否已经添加回AQS同步队列中，没有的话继续等待，有的话去竞争获取AQS的同步状态
- Condition的signal方法就是将等待队列头部节点移除并添加到AQS同步队列尾部，让该节点线程用于竞争获取同步状态的权利
  - 首节点从Condition等待队列出队
  - 修改首节点状态为0并添加到AQS同步队列尾部
  - 修改AQS中其前驱节点状态为SIGNAL或者Unpark唤醒节点线程
- AbstractQueuedSynchronizer中控制资源的state类型是int，有局限性，所以提供了AbstractQueuedLongSynchronizer，其中的state类型为long

## 并发基础

AQS是java concurrent包下并发组件实现的基础。AQS定义了同步队列的基本实现

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/ts2.jpg?raw=true)

AQS使用了模板方法模式，只定义了自旋+队列存储的基本实现。定义了一个volatile修饰的int类型state变量，然后声明了两个方法由子类实现。

- tryAcquire：用于获取同步状态，获取成功返回true，失败返回false
- tryRelease：用于释放持有的同步资源，释放成功返回true，失败返回false

```java
protected boolean tryAcquire(int arg) {
    throw new UnsupportedOperationException();
}
protected boolean tryRelease(int arg) {
  	throw new UnsupportedOperationException();
}
```

## AQS同步队列

AQS 是一个带有虚拟头节点的双端双向队列。队列的节点Node封装了线程，队列存储了获取同步状态失败被阻塞的线程。线程被唤醒后会自旋尝试获取同步状态。

当线程获取同步状态失败后，会用Node封装线程并添加到AQS尾部，然后调用park阻塞线程。如果获取同步状态成功，则当前节点出队

当获取执行权限成功的线程执行完毕后会释放资源，同时激活AQS同步队列中虚拟头节点后第一个节点包装的线程。被激活的线程会尝试获取同步状态，获取成功则加锁成功，将节点从同步队列中移除，执行完毕后再次激活同步队列中的阻塞节点线程。

```java
public abstract class AbstractQueuedLongSynchronizer extends AbstractOwnableSynchronizer implements java.io.Serializable {
      //头节点
      private transient volatile Node head;
      //尾节点
      private transient volatile Node tail;
     //操作的资源
      private volatile int state;
      protected final int getState() {
          return state;
      }
      protected final void setState(int newState) {
          state = newState;
      }
}
```

双向队列的节点类型是AQS内部类 Node，Node封装了线程Thread，并通过prev和next维护了一个链表，该链表代表了 阻塞在某资源上的阻塞线程链。Node节点的不同状态代表了该节点包装的线程不同的操作

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
    volatile Thread thread;//节点封装的线程
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

1. CANCELLED(1) 表示节点因超时或者中断被取消。被取消的节点上的线程永远不会再被阻塞
2. SIGNAL(-1) 表示当前节点的后继节点包含的线程被阻塞，当前线程执行完毕或取消后需要对其进行unpark操作。为了避免竞争，在阻塞线程之前一定要先判断前驱节点是否是SIGNAL
  3. CONDITION(-2) 表示当前节点在等待condition，也就是在condition queue中
4. PROPAGATE(-3) 表示当前场景下后续的acquireShared能够得以执行。
  5. 0，表示当前节点在sync queue中，等待着获取执行权限。

## 源码实现

按照资源获取的方式区分，AQS内部提供独占模式和共享模式

- 独占模式：只允许一个线程成功获取执行权限，排他的。如ReentrantLock
- 共享模式：允许多个线程同时成功获取执行权限，如Semaphore、CountDownLatch

### 独占模式获取执行权限

![CqLr0z](https://raw.githubusercontent.com/aspiresnow/aspiresnow.github.io/hexo/source/blog_images/2020/07/CqLr0z.png)

AQS中的acquire方法，调用钩子方法tryAcquire，tryAcquire由子类覆盖实现，如果获取资源成功，则当前线程获取执行权，如果失败，调用acquireQueued将当前线程加入等待队列，设置当前为独占锁模式，并阻塞当前线程

AQS的acquire定义了独占模式获取执行权限的逻辑

1. 调用子类的tryAcquire方法判断是否成功获取同步状态
   1. 如果成功获取同步状态，无需添加到AQS中，线程执行获取执行权
   2. 如果未获取到同步状态，当前线程添加到AQS中，进行阻塞
2. 调用addWaiter方法，使用Node封装当前线程，并添加到同步队列AQS的尾部
3. 调用acquireQueued方法，处理线程的阻塞与激活后再次尝试获取同步状态的逻辑
4. 当线程成功获取执行权后，响应阻塞阶段产生的中断信号

```java
public final void acquire(int arg) {
  //子类需要覆写tryAcquire方法
	if (!tryAcquire(arg) &&acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
		selfInterrupt();//阻塞线程无法响应中断，需要获得执行权后响应在阻塞状态下的中断信号
}
```

addWaiter方法中使用CAS保证了新的节点添加到队列的尾部。同时在第一次添加节点的时候，要保证添加一个虚拟头节点。添加的节点 Node的waitStatus默认为0

**注意**，入队的时候使用了CAS，所以无法保证线程的严格按照时间顺序公平入队

  ```Java
  private Node addWaiter(Node mode) {
      Node node = new Node(Thread.currentThread(), mode);
      // Try the fast path of enq; backup to full enq on failure
      Node pred = tail;
    	//节点已经初始化 快速尝试添加到队尾
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
  //CAS设置尾节点
  private final boolean compareAndSetTail(Node expect, Node update) {
    return unsafe.compareAndSwapObject(this, tailOffset, expect, update);
  }
  ```

在acquireQueued类似**自旋锁**的逻辑，实现了线程的阻塞、激活以及重复尝试获取同步状态、阻塞的逻辑，在该方法中保证了按照队列的先后顺序获取执行权

1. 线程被唤醒后下会进入for循环，判断前驱是否为头结点并不断尝试获取同步状态，成功则当前节点出队并获取执行权，失败则调用park阻塞当前线程

   1. 当前驱节点为虚拟头节点并且调用tryAcquire成功获取同步状态后，当前线程获取执行权，将头节点从AQS出队并将当前线程所处的节点设置为虚拟头节点，返回中断标识，当前线程获取执行权执行开始执行逻辑

   2. 前驱节点不是虚拟头节点或者调用tryAcquire获取同步状态失败，调用park将当前线程阻塞

      **注意**：一个被park阻塞的线程，会有两种情况被激活，**一种是其他线程调用unpark，一种是interrupt中断唤醒线程**。所以在判断的时候不仅要保证是队列中第一个有效的节点，同时还要调用tryAcquire获取同步状态

2. 定义了interrupted变量用于记录线程阻塞期间的中断标识，因为线程有了中断标识无法被park，所以当有中断时要调用Thread.interrupted()清除中断标识，同时用一个变量记录下interrupted，当线程成功获取执行权后再在外面调用Thread.interrupt发出中断信号

3. 调用failed变量用于记录是否获取执行权成功。当获取执行权成功后会将该变量设置为false，并且会将该节点出队，如果没有成功获取执行权，就不会有出队动作，在finally中会调用cancelAcquire方法将获取执行权失败的节点设置为CANCEL状态。

**注意：**此处的cancelAcquire可能会执行到，比如子类实现的tryAcquire抛出异常，会导致获取同步状态失败，然后需要将节点状态设置为取消，线程抛出异常消亡

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
                //因为是独占模式，该代码处不会有并发问题
                setHead(node);
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
      //如果上面for循环中抛出异常，线程会死亡，没有获取资源成功，会执行取消流程，将该结点作废
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
调用shouldParkAfterFailedAcquire保证当前节点的前驱节点waitStatus设置为SIGNAL，同时将前驱节点中已经标记为取消状态的节点删除，如果没有设置成功会返回false，在外层的for循环中再次进入直到前驱节点的状态为SIGNAL返回true

因为park是无限期的阻塞，需要其他线程显示调用unpark唤醒，当前节点park后要依靠前驱节点获取执行权执行完毕释放资源后调用unpark唤醒后继节点的线程，所以在阻塞当前线程前一定要保证该线程所处节点的前驱节点waitStatus状态为-1SIGNAL

```java
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
    int ws = pred.waitStatus;//获取前一个节点的状态
    //只有当前驱节点状态为SIGNAL，返回true，阻塞当前线程，否则会在外层for循环中再次进入该方法
    if (ws == Node.SIGNAL)
        return true;
    if (ws > 0) {
        do {//如果前一个节点已经被取消，从等待队列中移除已被取消的节点  循环操作，跳过被取消的线程
            node.prev = pred = pred.prev;
        } while (pred.waitStatus > 0);
        pred.next = node;
    } else {
        //当前线程要park的条件是必须成功的将其前继节点设置为 SIGNAL状态
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    return false;
}
```

当shouldParkAfterFailedAcquire方法中保证了当前线程节点的前驱节点状态为SIGNAL返回true，调用parkAndCheckInterrupt方法阻塞当前线程，通过LockSupport.park(this)阻塞线程。

当线程被激活后，调用Thread.interrupted()清除并返回中断是否被中断。清除是为了避免线程带有中断无法再次park

```java
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this);//当前线程被阻塞在该位置
    return Thread.interrupted();//当前线程是否已被中断，并清除中断标记位，防止再次park时失效
}
static void selfInterrupt() {
  Thread.currentThread().interrupt();//当前线程发出中断信号
}
```

当线程获取执行权失败后要将该线程对应的节点设置为CANCELLED状态，同时要保证该节点的后继节点能够被唤醒

- 如果当前节点是尾节点，无需考虑后继节点，直接将当前节点从队列删除
- 如果不是尾节点，要找到前驱节点为-1的，并找到后继节点需要被唤醒的节点，拼接
- 如果找不到前驱节点，调用unparkSuccessor唤醒后继节点

```java
private void cancelAcquire(Node node) {
    if (node == null)
        return;
    node.thread = null;

    //删除已经被取消的前驱节点
    Node pred = node.prev;
    while (pred.waitStatus > 0)
        node.prev = pred = pred.prev;
    Node predNext = pred.next;
    node.waitStatus = Node.CANCELLED;

    //如果当前节点为尾节点，直接删除
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
          //如果找不到唤醒后继节点
            unparkSuccessor(node);
        }
        node.next = node; // help GC
    }
}
```

### 独占模式释放资源

AQS中release方法用于独占模式释放资源，由于是独占模式，在该方法中只有同时由一个线程，所以不需要考虑并发问题，处理逻辑会很简单

1. 调用子类覆写的tryRelease释放资源，AQS上并不会定义释放资源的具体实现，由子类提供，最终返回一个true or false即可。
2. 释放资源后，调用unparkSuccessor方法唤醒同步队列中第一个有效的节点的线程

**注意**：第一要先调用tryRelease释放资源，再激活后继节点线程。避免造成线程被唤醒后，本线程还未释放资源，导致被唤醒的线程再次park，由于又没有前驱节点，导致无法被唤醒。同时会导致一个问题，新来的线程可能会先于后继线程获取资源(非公平锁的实现)

  ```java
  public final boolean release(int arg) {
    //先将status减去,释放资源，新来的获取锁的线程也能获取到锁。
    //如果先判断head，再调用tryRelease
      if (tryRelease(arg)) {
          Node h = head;
          //当头节点不为空，并且waitStatus不为0，唤醒后继节点
          if (h != null && h.waitStatus != 0)//
              unparkSuccessor(h);
          return true;
      }
      return false;
  }
  ```

在unparkSuccessor方法中通过LockSupport.unpark()唤醒AQS同步队列中第一个有效的节点

  ```java
  private void unparkSuccessor(Node node) {
      
      int ws = node.waitStatus;
      if (ws < 0)//状态值小于0，为SIGNAL -1 或 CONDITION -2 或 PROPAGATE -3
          compareAndSetWaitStatus(node, ws, 0);
			//找到后继节点
      Node s = node.next;
      //如果下一个节点为空或者取消，则找队列中下一个不为空并未取消的节点
      if (s == null || s.waitStatus > 0) {
          s = null;//从后往前找到最前面未被取消的节点
          for (Node t = tail; t != null && t != node; t = t.prev)
              if (t.waitStatus <= 0)
                  s = t;
      }
      if (s != null)
          LockSupport.unpark(s.thread);//唤醒
  }
  ```



### 共享模式获取执行权限

AQS中acquireShared方法用于共享模式下获取资源执行权，如果获取执行权失败当前线程添加到同步队列尾部，并阻塞

1. 调用子类实现的tryAcquireShared方法，由子类来决定是否获取同步状态成功
2. tryAcquireShared成功获取同步状态，返回一个大于0的数，然后线程直接获取执行权
3. 如果没有获取到同步状态，则调用doAcquireShared方法，将线程添加到阻塞队列，自旋尝试获取同步状态

```java
public final void acquireShared(int arg) {
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);
}
```

doAcquireShared方法中控制线程入队、自旋获取同步状态、阻塞

1. addWaiter将线程包装为Node并添加到AQS同步队列尾部
2. 自旋判断前驱节点是否为头节点并调用tryAcquireShared尝试获取同步状态
3. 如果未获取到同步状态，跟独占模式一样的处理，保证前驱节点状态为SIGNAL并调用park阻塞当前线程
4. 如果成功获取同步状态，当前线程节点出队，获取执行权。与独占模式不同的是，释放的资源没有全部使用的情况下需要再次唤醒当前节点的后继节点

```java
private void doAcquireShared(int arg) {
final Node node = addWaiter(Node.SHARED); //指定node节点模式，比独享锁多了一个nextWaiter
boolean failed = true;
try {
    boolean interrupted = false;
    for (;;) {
        final Node p = node.predecessor();//获取前驱节点
        if (p == head) {//如果前驱节点是head，则尝试获取同步状态
            int r = tryAcquireShared(arg);//尝试获取资源
            if (r >= 0) {//成功获取同步状态，当前线程获取执行权
              // 当前节点出队，如果r还有剩余可用的，尝试唤醒队列中下个节点的线程
                setHeadAndPropagate(node, r);
                p.next = null; // help GC
                if (interrupted)//如果等待过程有收到中断，补上中断标记
                    selfInterrupt();
                failed = false;
                return;
            }
        }
        //同步状态获取失败，保证前驱节点waitstatus状态，然后调用park阻塞当前线程
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

当前节点获取执行权后，当前节点出队，判断资源是否有空余，如果有则唤醒队列中自己下一个节点线程

```java
private void setHeadAndPropagate(Node node, int propagate) {
    Node h = head; 
    setHead(node);//head指向当前节点
    //如果还有剩余量，继续唤醒当前节点的后继节点线程
  //1.propagate>0 表示还有剩余资源，需要唤醒后继共享节点
//2.h.waitStatus<0 如果h.waitStatus = PROPAGATE，表示之前的某次调用暗示了资源有剩余，所以需要
//唤醒后继共享模式节点，由于PROPAGATE状态可能转化为SIGNAL状态，所以直接使用h.waitStatus < 0来判断
//如果现在的头节点的waitStatus<0，唤醒
//3.h==null，表示此节点变成头节点之前，同步队列为空，现在当前线程获得了资源，那么后面共享的节点也
//可能获得资源
   if (propagate > 0 || h == null || h.waitStatus < 0 ||
        (h = head) == null || h.waitStatus < 0) {
        Node s = node.next;
        if (s == null || s.isShared())
            doReleaseShared();
    }
}
```

### 共享模式释放资源

AQS中的releaseShared方法用于共享模式下释放资源。共享模式下释放资源比独占模式下复杂一些，因为在共享模式下释放资源时会有并发问题

1. 调用子类实现的tryReleaseShared方法进行资源释放，同时返回是否释放成功
2. 成功释放资源后，要调用doReleaseShared唤醒同步队列中等待的线程节点

```java
public final boolean releaseShared(int arg) {
    if (tryReleaseShared(arg)) {
        doReleaseShared();
        return true;
    }
    return false;
}
```

调用doReleaseShared唤醒同步队列中的节点线程，由于会出现并发执行doReleaseShared，所以这里使用了for循环+CAS保证能唤醒后继节点线程

```java
  private void doReleaseShared() {
          for (;;) {
              //唤醒操作由头节点开始，注意这里的头节点已经是上面新设置的头节点了
              //其实就是唤醒上面新获取到共享锁的节点的后继节点
              Node h = head;
              //1.如果头节点不为空，且头节点不等于尾节点，说明还有线程在同步队列中等待。
              if (h != null && h != tail) {
                  int ws = h.waitStatus;
                  //表示后继节点需要被唤醒
                  if (ws == Node.SIGNAL) {
                      //这里需要控制并发，因为入口有setHeadAndPropagate跟release两个，避免两次unpark
                      if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0))
                          continue;      
                      //执行唤醒操作      
                      unparkSuccessor(h);
                  }
                  //如果头节点的状态为0，说明后继节点还没有被阻塞，不需要立即唤醒，把当前节点状态设置为PROPAGATE确保以后可以传递下去，下次调用setHeadAndPropagate的时候前任头节点的状态就会是PROPAGATE，就会继续调用doReleaseShared方法把唤醒“传播”下去
                  else if (ws == 0 &&
                           !compareAndSetWaitStatus(h, 0, Node.PROPAGATE))
                      continue;                
              }
              //如果头节点没有发生变化，表示设置完成，退出循环
              //如果头节点发生变化，比如说其他线程获取到了锁，为了使自己的唤醒动作可以传递，必须进行重试
              if (h == head)                   
                  break;
          }
      }
```

### Condition实现

并发包中定了Condition接口，定义了线程间通信的基本方法，对应wait和notify的实现

```java
public interface Condition {
    //阻塞并释放锁
    void await() throws InterruptedException;
    //可中断的阻塞并释放锁
    void awaitUninterruptibly();
    //带超时的阻塞并释放锁
    long awaitNanos(long nanosTimeout) throws InterruptedException;
    //带超时的阻塞并释放锁
    boolean await(long time, TimeUnit unit) throws InterruptedException;
    //指定时间的阻塞并释放锁
    boolean awaitUntil(Date deadline) throws InterruptedException;
    //唤醒等待队列中第一个线程
    void signal();
    //唤醒等待队列中所有线程
    void signalAll();
}
```

AQS中定义了内部类ConditionObject实现了Condition接口。内部类可以访问外部类AQS的任意方法。ConditionObject也是一个双端双向队列，队列的节点类型复用了AQS的Node类型。

```java
public class ConditionObject implements Condition, java.io.Serializable {
    private transient Node firstWaiter;//头节点
    private transient Node lastWaiter;//尾节点
}
```

![v7buIP](https://raw.githubusercontent.com/aspiresnow/aspiresnow.github.io/hexo/source/blog_images/2020/07/v7buIP.png)

#### await

Condition的await实质就是将线程阻塞同时封装线程添加到Condition等待队列尾部。线程被唤醒后自旋判断已经不在等待队列后，要再次去自旋获取同步队列的执行权，如果获取失败再次阻塞在同步队列上

ConditionObject中await方法实现

1. addConditionWaiter封装节点添加到等待队列尾部
2. 调用AQS的fullyRelease释放同步状态，放弃执行权
3. 自旋判断当前节点是否已经被转移到AQS的同步队列中，如果没有继续阻塞，如果完成则当前线程获取AQS竞争权
4. 线程获取AQS竞争权后调用acquireQueued自旋获取同步状态，失败再次阻塞在同步队列上

```java
public final void await() throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException();
    Node node = addConditionWaiter();
  //释放同步状态，放弃执行权
    int savedState = fullyRelease(node);
    int interruptMode = 0;
  //自旋，避免是中断唤醒的线程
    while (!isOnSyncQueue(node)) {
        LockSupport.park(this);
        if ((interruptMode = checkInterruptWhileWaiting(node)) != 0)
            break;
    }
    //线程被唤醒后，调用acquireQueued方法，自旋获取AQS的执行权
    if (acquireQueued(node, savedState) && interruptMode != THROW_IE)
        interruptMode = REINTERRUPT;
    if (node.nextWaiter != null) // clean up if cancelled
        unlinkCancelledWaiters();
    if (interruptMode != 0)
        reportInterruptAfterWait(interruptMode);
}
```

添加到Condition等待队列的尾部

```java
private Node addConditionWaiter() {
    Node t = lastWaiter;
    // If lastWaiter is cancelled, clean out.
    if (t != null && t.waitStatus != Node.CONDITION) {
        unlinkCancelledWaiters();
        t = lastWaiter;
    }
    Node node = new Node(Thread.currentThread(), Node.CONDITION);
    if (t == null)
        firstWaiter = node;
    else
        t.nextWaiter = node;
    lastWaiter = node;
    return node;
}
```

调用AQS的fullyRelease释放当前线程占用的资源，当前线程放弃执行权

```java
final int fullyRelease(Node node) {
    boolean failed = true;
    try {
        int savedState = getState();
      //调用release方法释放资源
        if (release(savedState)) {
            failed = false;
            return savedState;
        } else {
            throw new IllegalMonitorStateException();
        }
    } finally {
        if (failed)
            node.waitStatus = Node.CANCELLED;
    }
}
```

调用AQS的isOnSyncQueue方法判断当前节点是否已经转移到AQS的同步队列中

```java
final boolean isOnSyncQueue(Node node) {
  //AQS中有虚拟头节点，所以一定会存在pre
    if (node.waitStatus == Node.CONDITION || node.prev == null)
        return false;
    if (node.next != null) // If has successor, it must be on queue
        return true;
    //避免CAS操作带来的next问题，node.prev一定不为空，从后往前找一定没问题
    return findNodeFromTail(node);
}
//从后往前在队列中查找node节点
private boolean findNodeFromTail(Node node) {
  Node t = tail;
  for (;;) {
    if (t == node)
      return true;
    if (t == null)
      return false;
    t = t.prev;
  }
}
```

调用AQS的acquireQueued方法，自旋获取同步状态。

**注意**，此时当前线程在signal方法已经从等待队列中出队，**并且已经完成了了在AQS同步队列的入队操作**。所以这里自旋获取同步状态，失败则进入阻塞状态

```java
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return interrupted;
            }
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

#### signal

![EFNjcw](https://raw.githubusercontent.com/aspiresnow/aspiresnow.github.io/hexo/source/blog_images/2020/07/EFNjcw.png)

ConditionObject中signal方法用于唤醒等待队列头部的节点线程，实质操作就是将等待队列头部节点移除并添加到AQS同步队列中，让那个线程拥有竞争AQS资源的权限

```java
public final void signal() {
  //当前线程必须是锁持有者
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();
    Node first = firstWaiter;
    if (first != null)
        doSignal(first);
}
```

doSignal方法中实现了三个操作

1. 等待队列头节点出队
2. 调用transferForSignal方法将出队的头节点添加到AQS同步队列尾部
3. 将该节点在同步队列的前驱节点状态设置为-1，或者唤醒该节点线程

```java
private void doSignal(Node first) {
    do {
        if ( (firstWaiter = first.nextWaiter) == null)
            lastWaiter = null;
        first.nextWaiter = null;
    } while (!transferForSignal(first) &&
             (first = firstWaiter) != null);
}
```

调用AQS的transferForSignal将该节点添加到AQS同步队列，并设置其前驱节点状态为SIGNAL，否则唤醒该线程

```java
final boolean transferForSignal(Node node) {
    //将节点状态设置为 0 
    if (!compareAndSetWaitStatus(node, Node.CONDITION, 0))
        return false;
    //调用AQS的enq方法，将当前节点添加到AQS同步队列尾部，并返回前驱节点
    Node p = enq(node);
    int ws = p.waitStatus;
    //如果前驱节点不是-1，唤醒该线程
    if (ws > 0 || !compareAndSetWaitStatus(p, ws, Node.SIGNAL))
        LockSupport.unpark(node.thread);
    return true;
}
```

### 其他方法

AQS中doAcquireInterruptibly方法提供了可中断锁的实现

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

AQS中doAcquireInterruptibly方法提供了带超时锁的实现

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




