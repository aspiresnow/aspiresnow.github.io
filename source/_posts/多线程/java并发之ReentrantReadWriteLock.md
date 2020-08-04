---
title: java并发之ReentrantReadWriteLock
date: 2018-11-22
tags:
- 多线程
categories:
- java基础
---

# java并发之ReentrantReadWriteLock

## 知识导读

- 读写锁内部维护了两个分离的锁，读锁和写锁，两个锁共用一个AQS实现。state的高16位记录读锁资源占用，低16位记录写锁资源占用。读锁基于AQS的共享模式实现，写锁基于AQS的独占模式实现
- 读锁和写锁都是可重入，提供公平模式和非公平模式的。非公平模式的读锁要优先等待队列中头部是写锁的线程去获取写锁。
- 当一个线程持有写锁的时候，允许当前线程再添加读锁，锁降级；当一个线程持有读锁的时候不允许再添加写锁，即不允许锁升级。锁释放的时候需要按照加锁顺序释放

## 原理

1. ReentrantReadWriteLock持有两把锁，readerLock和writerLock
   - readerLock是基于AQS共享模式的可重入、可共享的锁。提供了公平和非公平两种加锁模式
   - writerLock是基于AQS独占模式的可重入锁。提供了公平和非公平两种加锁模式
2. ReentrantReadWriteLock的内部类Sync继承了AQS，覆写实现了独占模式和共享模式获取同步状态和释放资源的逻辑，readerLock和writerLock是基于同一个Sync实例实现的。Sync中state变量的高16位记录读锁的资源获取情况，state变量的低16位记录写锁的资源获取情况。
3. 当一个线程持有写锁的时候，允许当前线程再添加读锁，锁降级；当一个线程持有读锁的时候不允许再添加写锁，即不允许锁升级。锁释放的时候需要按照加锁顺序释放
4. 添加读锁后不允许添加写锁，个人感觉原因是读锁与读锁是可以共存的，当加了读锁后再加写锁需要其他线程持有的读锁全部释放，单纯的只看添加读锁的是否是本线程不行。不过也能做啊，为啥不支持，还是想不通，判断一下读锁的state数量和firstReaderHoldCount数一致就能判断出当前读锁是否只被当前线程持有
5. 获取读、写锁失败被阻塞的线程都会添加到同一个队列中，当读锁很多的时候，容易反生写锁饥饿的情况

注意：state变量是一个int值，高16位和低16位分别表示读锁和写锁的资源数量，所以读、写锁的资源都有个最大值，2的16次方-1

锁降级实现

```java
class CashData {
    Object obj;
    volatile boolean cacheValid;
    ReentrantReadWriteLock rwl = new ReentrantReadWriteLock();

    public Object load() {
        rwl.readLock().lock();
        if (!cacheValid) {
            // 释放读锁
            rwl.readLock().unlock();
            // 要进行赋值，添加写锁
            rwl.writeLock().lock();
            try {
                if (!cacheValid) {
                    cacheValid = true;
                    obj = 1;
                }
                rwl.readLock().lock();
            } finally {
                rwl.writeLock().unlock(); // Unlock write, still hold read
            }
        }
        rwl.readLock().unlock();
        return obj;
    }
}
```

## 源码分析

### 基本构造

ReentrantReadWriteLock内部持有两个锁实现。api都是调用这两个锁的api，ReentrantReadWriteLock只是一个外层包装。在创建ReentrantReadWriteLock实例的时候会初始化一个Sync实例，读锁和写锁都是基于Sync实现。

```java
private final ReentrantReadWriteLock.ReadLock readerLock;//读锁
private final ReentrantReadWriteLock.WriteLock writerLock;//写锁
//AQS实现类，基于该类实现
final Sync sync;
public ReentrantReadWriteLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
    //创建读、写锁的时候会使用 同一个Sync来创建
    readerLock = new ReadLock(this);
    writerLock = new WriteLock(this);
}
public ReentrantReadWriteLock.WriteLock writeLock() { return writerLock; }
public ReentrantReadWriteLock.ReadLock  readLock()  { return readerLock; }
```

ReadLock实现了Lock接口，基于ReentrantReadWriteLock的内部类Sync的共享模式模式实现，每次加锁需要修改state的高16位值+1

```java
public static class ReadLock implements Lock, java.io.Serializable {
    private final Sync sync;

    protected ReadLock(ReentrantReadWriteLock lock) {
        sync = lock.sync;
    }
	 //使用AQS的共享模式模式
    public void lock() {
        sync.acquireShared(1);
    }

    public void lockInterruptibly() throws InterruptedException {
        sync.acquireSharedInterruptibly(1);
    }

    public boolean tryLock() {
        return sync.tryReadLock();
    }

    public boolean tryLock(long timeout, TimeUnit unit)
            throws InterruptedException {
        return sync.tryAcquireSharedNanos(1, unit.toNanos(timeout));
    }

    public void unlock() {
        sync.releaseShared(1);
    }

    public Condition newCondition() {
        throw new UnsupportedOperationException();
    }
}
```

WriteLock实现了Lock接口，基于ReentrantReadWriteLock的内部类Sync的独占模式实现，每次加锁需要修改state的低16位值+1

```java
public static class WriteLock implements Lock, java.io.Serializable {
    private final Sync sync;

    protected WriteLock(ReentrantReadWriteLock lock) {
        sync = lock.sync;
    }
    //使用AQS的独占模式
    public void lock() {
        sync.acquire(1);
    }
		//使用AQS的独占模式
    public void lockInterruptibly() throws InterruptedException {
        sync.acquireInterruptibly(1);
    }
		//使用AQS的独占模式
    public boolean tryLock( ) {
        return sync.tryWriteLock();
    }
    //使用AQS的独占模式
    public boolean tryLock(long timeout, TimeUnit unit)
            throws InterruptedException {
        return sync.tryAcquireNanos(1, unit.toNanos(timeout));
    }
    //使用AQS的独占模式
    public void unlock() {
        sync.release(1);
    }
    public Condition newCondition() {
        return sync.newCondition();
    }
    public boolean isHeldByCurrentThread() {
        return sync.isHeldExclusively();
    }
    public int getHoldCount() {
        return sync.getWriteHoldCount();
    }
}
```

### Sync实现

ReentrantReadWriteLock中的读、写锁各个方法的实现都依赖内部类Sync。Sync继承了AQS，覆写了AQS的独占模式方法和共享模式方法

#### Sync内部构造

```java
abstract static class Sync extends AbstractQueuedSynchronizer {
  static final int SHARED_SHIFT   = 16;
  static final int SHARED_UNIT    = (1 << SHARED_SHIFT);
  static final int MAX_COUNT      = (1 << SHARED_SHIFT) - 1;
  static final int EXCLUSIVE_MASK = (1 << SHARED_SHIFT) - 1;
  //获取当前读锁数量(共享+重入)，高16位的数值
  static int sharedCount(int c)    { return c >>> SHARED_SHIFT; }
  //获取当前写锁数量(重入)，低16位的数值
  static int exclusiveCount(int c) { return c & EXCLUSIVE_MASK; }
  Sync() {
    readHolds = new ThreadLocalHoldCounter();
    setState(getState()); // ensures visibility of readHolds
  }
}
```

#### 独占模式(写锁实现)

##### 独占模式加锁

Sync覆写AQS的tryAcquire方法，只允许一个线程获取写锁的同步状态成功

1. 如果当前存在读锁，不允许添加写锁，无论是否持有读锁的线程是否为本线程，返回获取同步状态失败，当前线程入队自旋阻塞
2. 如果当前有其他线程持有写锁，返回获取同步状态失败，当前线程入队自旋阻塞
3. 如果持有写锁的是当前线程，重入独占锁，直接设置state值
4. 如果写锁的数量超过允许的最大值，则返回获取同步状态失败
5. CAS设置state值
   1. CAS设置state失败，则返回获取同步状态失败
   2. CAS设置state成功，则获取同步状态成功，设置持有写锁的线程为当前线程，返回true，当前线程继续执行

```java
protected final boolean tryAcquire(int acquires) {
    Thread current = Thread.currentThread();
    int c = getState();
    int w = exclusiveCount(c);//获取当前写锁数量
    if (c != 0) {
        //有其他线程持有读锁，返回false
        if (w == 0 || current != getExclusiveOwnerThread())
            return false;
        if (w + exclusiveCount(acquires) > MAX_COUNT)
            throw new Error("Maximum lock count exceeded");
        //重入
        setState(c + acquires);
        return true;
    }
    //公平锁和非公平锁逻辑 由writerShouldBlock方法来判断
    if (writerShouldBlock() ||
        !compareAndSetState(c, c + acquires))
        return false;
    //获取同步状态成功，设置持有锁的线程为当前线程
    setExclusiveOwnerThread(current);
    return true;
}
```

非公平锁NonfairSync的writerShouldBlock方法直接返回false，可以直接CAS设置state值来获取同步状态
公平锁FairSync的writerShouldBlock调用AQS的hasQueuedPredecessors方法来判断，跟ReenTrantLock一样，判断AQS同步队列中是否存在排在该线程之前的的节点，保证先入队的先执行

##### 独占模式释放锁

Sync覆写AQS的tryRelease方法，定义释放资源的逻辑。由于是独占模式，只会有一个线程同时执行该方法，不会存在并发问题

1. 首先判断如果不是持有写锁的线程，调用该方法直接抛出异常
2. state的低16位存储写锁数，没releae一次，低16位减去1，当低16位数值为0的时候，释放写锁成功，修改持有写锁的线程为null

```java
protected final boolean tryRelease(int releases) {
    if (!isHeldExclusively())
        throw new IllegalMonitorStateException();
    int nextc = getState() - releases;
    //判断写锁数量是否为0，0的时候修改持有写锁的线程为null
    boolean free = exclusiveCount(nextc) == 0;
    if (free)
        setExclusiveOwnerThread(null);
    setState(nextc);
    return free;
}
```

#### 共享模式(读锁实现)

##### 共享模式加锁

Sync覆写AQS的tryAcquireShared方法，定义获取同步状态的逻辑

1. 存在写锁，如果持有写锁的是当前线程则允许添加读锁，如果持有写锁的是其他线程则不允许添加读锁
2. 调用readerShouldBlock来判断是否公平与非公平
3. 判断读锁数量不要超过最大值，不能超过16位数值的最大值
4. 存在并发则CAS设置state的值，如果成功则获取读锁的同步状态成功，返回1
5. 如果获取读锁的同步状态失败，调用fullTryAcquireShared方法，循环再次尝试一遍

```java
protected final int tryAcquireShared(int unused) {
    Thread current = Thread.currentThread();
    int c = getState();
    //其他线程持有写锁，直接返回-1，获取同步状态失败
    if (exclusiveCount(c) != 0 &&
        getExclusiveOwnerThread() != current)
        return -1;
    //获取state的高16位数值(读锁数量)
    int r = sharedCount(c);
    if (!readerShouldBlock() &&
        r < MAX_COUNT &&
        compareAndSetState(c, c + SHARED_UNIT)) {
        //读锁数量为0，第一次加读锁，设置firstReader为当前线程
        if (r == 0) {
            firstReader = current;
            firstReaderHoldCount = 1;
        } else if (firstReader == current) { //读锁重入，如果当前线程是第一个持有该读锁的线程，计数器+1
            firstReaderHoldCount++;
        } else {
            HoldCounter rh = cachedHoldCounter;
            if (rh == null || rh.tid != getThreadId(current))
                cachedHoldCounter = rh = readHolds.get();
            else if (rh.count == 0)
                readHolds.set(rh);
            rh.count++;
        }
       //成功获取同步状态，返回一个正整数或者0
        return 1;
    }
    //获取同步状态失败 
    return fullTryAcquireShared(current);
}
```

fullTryAcquireShared方法实现基本与tryAcquireShared方法中的逻辑一样，多了一层CAS设置失败后再for循环重试

```java
final int fullTryAcquireShared(Thread current) {
    HoldCounter rh = null;
    for (;;) {
        int c = getState();
        if (exclusiveCount(c) != 0) {
            if (getExclusiveOwnerThread() != current)
                return -1;
        } else if (readerShouldBlock()) {
            if (firstReader == current) {
            } else {
                if (rh == null) {
                    rh = cachedHoldCounter;
                    if (rh == null || rh.tid != getThreadId(current)) {
                        rh = readHolds.get();
                        if (rh.count == 0)
                            readHolds.remove();
                    }
                }
                if (rh.count == 0)
                    return -1;
            }
        }
        if (sharedCount(c) == MAX_COUNT)
            throw new Error("Maximum lock count exceeded");
        if (compareAndSetState(c, c + SHARED_UNIT)) {
            if (sharedCount(c) == 0) {
                firstReader = current;
                firstReaderHoldCount = 1;
            } else if (firstReader == current) {
                firstReaderHoldCount++;
            } else {
                if (rh == null)
                    rh = cachedHoldCounter;
                if (rh == null || rh.tid != getThreadId(current))
                    rh = readHolds.get();
                else if (rh.count == 0)
                    readHolds.set(rh);
                rh.count++;
                cachedHoldCounter = rh; // cache for release
            }
            return 1;
        }
    }
}
```

公平锁FairSync的readerShouldBlock调用AQS的hasQueuedPredecessors方法来判断，跟ReenTrantLock一样，判断AQS同步队列中是否存在排在该线程之前的的节点，保证先入队的先执行

非公平锁NonfairSync的readerShouldBlock实现，如果AQS同步队列中第一个是等待写锁的线程则返回true，当前获取读锁的线程先阻塞，优先让等待队列的线程去获取写锁

```java
final boolean apparentlyFirstQueuedIsExclusive() {
    Node h, s;
    return (h = head) != null &&
        (s = h.next)  != null &&
        !s.isShared()         &&
        s.thread != null;
}
```

##### 共享模式释放锁

Sync覆写AQS的tryReleaseShared方法，定义释放资源的逻辑。当前是共享模式，会有多个线程同时获取执行权，所以该方法会存在多线程并发执行的情况

1. 修改firstReader和firstReaderHoldCount变量值，感觉是为了查询方便
2. for循环加CAS修改state的高16位值，当state的高16位为0的时候，释放成功返回true

```java
protected final boolean tryReleaseShared(int unused) {
    Thread current = Thread.currentThread();
    if (firstReader == current) {
        // assert firstReaderHoldCount > 0;
        if (firstReaderHoldCount == 1)
            firstReader = null;
        else
            firstReaderHoldCount--;
    } else {
        HoldCounter rh = cachedHoldCounter;
        if (rh == null || rh.tid != getThreadId(current))
            rh = readHolds.get();
        int count = rh.count;
        if (count <= 1) {
            readHolds.remove();
            if (count <= 0)
                throw unmatchedUnlockException();
        }
        --rh.count;
    }
    for (;;) {
        int c = getState();
        int nextc = c - SHARED_UNIT;
        if (compareAndSetState(c, nextc))
            return nextc == 0;
    }
}
```

