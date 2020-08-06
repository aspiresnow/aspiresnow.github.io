---
title: java并发之ReentrantLock
date: 2017-10-29 09:35:30
tags:
- 多线程
categories:
- java基础
---

# java并发之ReentrantLock

## 知识导读

- 了解ReentrantLock与synchronized的区别
- ReentrantLock是支持可重入的排它锁，同时支持公平锁和非公平锁两种方式
- ReentrantLock内部类Sync实现了AQS，ReentrantLock的api是对内部类Sync的代理
- ReentrantLock使用的AQS的独占模式，所以需要覆写tryAcquire和tryRelease方法，在该方法中ReentrantLock的内部类通过操作和判断AQS的state状态来获取同步状态。当state=0代表可以获取同步状态;当state>0代表同步状态已被占用，然后判断占用同步状态的线程是否是本线程
- ReentrantLock公平锁和非公平锁的区别主要在于，公平锁在CAS设置state之前要先判断AQS同步队列中是否有排在当前线程之前的节点，保证AQS同步队列中的线程优先获取执行权
- ReentrantLock是重入锁，每次重入state+1，释放的时候需要每次state-1，当state为0的时候，锁释放
- 非公平锁可能会导致锁饥饿问题

## ReentrantLock和synchronized的区别

1. ReentrantLock实现了Lock接口，提供了丰富的加锁方式
2. ReentrantLock在等待锁时可以使用lockInterruptibly()方法选择中断， 改为处理其他事情，而synchronized关键字，线程需要一直等待下去。同样的，tryLock()方法可以设置超时时间，用于在超时时间内一直获取不到锁时进行中断。
3. ReentrantLock可以实现公平锁，而synchronized的锁是非公平的。
4. ReentrantLock可以通过api获取正在等待锁的线程。
5. ReentrantLock可以同时绑定多个Condition对象，而synchronized中，锁对象的wait()和notify()或notifyAll()方法可以实现一个隐含的条件，如果要和多于一个条件关联时，只能再加一个额外的锁，而ReentrantLock只需要多次调用newCondition方法即可。

## 源码解读

ReentrantLock的构造器就是创建一个内部类Sync的实例。公平锁和非公平使用不同的Sync。ReentrantLock中Lock API的实现都是通过AQS来实现的。

```java
public ReentrantLock() {
    sync = new NonfairSync();
}
public ReentrantLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
}
```

抽象内部类Sync继承了AbstractQueuedSynchronizer类，state初始化为0，表示未锁定状态。

```java
abstract static class Sync extends AbstractQueuedSynchronizer {
    private static final long serialVersionUID = -5179523762034025860L;

    abstract void lock();
}
```

### 公平锁

公平锁保证了先加入AQS同步队列的线程优先获取执行权。
线程在修改state之前，需要先判断等待队列是否存在等待线程，如果存在则当前线程放入队列，进入阻塞状态。

内部类FairSync提供了公平锁的实现，继承自Sync，覆写了AQS的tryAcquire方法。

1. 获取state，当state=0(资源可用)时，先调用hasQueuedPredecessors判断AQS同步队列是否有排在当前线程之前的等待线程，没有再CAS尝试修改state获取同步状态，成功后修改当前线程为持有锁的线程
2. 如果state!=0(资源不可用)，代表当前锁已被线程持有。判断持有该锁的线程是否是本线程，如果是代表重入，将state+1，继续获取执行权
3. 如果获取同步状态失败(state>0)，返回false，该线程在AQS中加入AQS同步队列

```java
static final class FairSync extends Sync {
  
    final void lock() {
      	acquire(1);
    }
    //覆写 tryAcquire
    protected final boolean tryAcquire(int acquires) {
        final Thread current = Thread.currentThread();
        int c = getState();
      // 资源可用
        if (c == 0) {
          //查询同步队列是否存在排在本线程之前的节点
            if (!hasQueuedPredecessors() &&
                compareAndSetState(0, acquires)) {//CAS修改state
                setExclusiveOwnerThread(current);
                return true;
            }
        } else if (current == getExclusiveOwnerThread()) {//重入锁
            int nextc = c + acquires;
            if (nextc < 0)
                throw new Error("Maximum lock count exceeded");
            setState(nextc);
            return true;
        }
        return false;
    }
}
```

查询是否存在其他线程等待时间比当前线程长，判断AQS同步队列中虚拟头节点后面的第一个节点如果存在并且Thread不是当前线程，代表存在等待时间超过当前线程的线程，返回true

```java
public final boolean hasQueuedPredecessors() {
    Node t = tail; // Read fields in reverse initialization order
    Node h = head;
    Node s;
  //当前队列存在等待线程，并且该线程不是当前线程
    return h != t &&
        ((s = h.next) == null || s.thread != Thread.currentThread());
}
```

### 非公平锁

非公平锁就比较简单了，直接去修改state就行，不需要判断同步队列中其他线程的先后顺序

1. 快速CAS尝试将state从0改为1，成功则加锁成功
2. 快速尝试失败，判断state值，如果为0，在CAS尝试加锁，如果成功，加锁成功，修改持有锁的线程为本线程
3. 如果state!=0(资源不可用)，代表当前锁已被线程持有。判断持有该锁的线程是否是本线程，如果是代表重入，将state+1，继续获取执行权，跟公平锁处理一样
4. 如果获取同步状态失败(state>0)，返回false，该线程在AQS中加入AQS同步队列

```java
static final class NonfairSync extends Sync {
    private static final long serialVersionUID = 7316153563782823691L;
    final void lock() {
        //快速尝试是否能将 state 从 0 变为 1，如果成功则加锁成功并获取执行权
        if (compareAndSetState(0, 1))
            setExclusiveOwnerThread(Thread.currentThread());
        else
            acquire(1);//调用AQS的acquire方法
    }

    protected final boolean tryAcquire(int acquires) {
        return nonfairTryAcquire(acquires);
    }
}

final boolean nonfairTryAcquire(int acquires) {
  final Thread current = Thread.currentThread();
  int c = getState();
  if (c == 0) {
    if (compareAndSetState(0, acquires)) {
      setExclusiveOwnerThread(current);
      return true;
    }
  }
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

### 独占锁释放锁流程

由于使用的AQS的独占锁模式，所以在释放同步状态的时候，是单线程的，不需要考虑并发问题会简单很多

独占锁的释放主要是将state从n减到0，ReetrantLock中的unlock方法实际调用的Sync类继承的AQS的realse方法，每次unlock是对state进行原子减1

```java
public void unlock() {
  sync.release(1);//调用AQS的release方法操作state
}
```

在内部类Sync中定义了公平锁和非公平锁统一的释放资源逻辑tryRelease方法,在这只需要将state-1就行，重入多少次则需要release多少次，当state减为0的时候表示不再占用资源，将独占资源的线程设置为null，并返回true，代表释放锁成功

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