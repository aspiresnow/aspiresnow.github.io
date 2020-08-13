---
title: java并发之阻塞队列
date: 2017-09-04
tags:
- 多线程
- 集合
- 数据结构
categories:
- java基础
---

# java并发之阻塞队列

## 知识导读

- ArrayBlockingQueue

Queue接口与List、Set同一级别，都是继承了Collection接口。LinkedList实现了Queue接 口。

Queue是一种数据结构．它有两个基本操作：在队列尾部加人一个元素，和从队列头部移除一个元素就是说，队列以一种先进先出的方式管理数据，如果你试图向一个 已经满了的阻塞队列中添加一个元素或者是从一个空的阻塞队列中移除一个元索，将导致线程阻塞．

在多线程进行合作时，阻塞队列是很有用的工具。工作线程可 以定期地把中间结果存到阻塞队列中而其他工作者线线程把中间结果取出并在将来修改它们。队列会自动平衡负载。如果第一个线程集运行得比第二个慢，则第二个 线程集在等待结果时就会阻塞。如果第一个线程集运行得快，那么它将等待第二个线程集赶上来。

## BlockingQueue

BlockingQueue对于添加、移除和检查操作分别提供了四种处理方法：第一种是抛出一个异常，第二种是返回一个特殊值（null 或 false，具体取决于操作），第三种是在操作可以成功前，无限期地阻塞当前线程，第四种是等待指定时间后超时放弃。

| 操作   | 抛出异常      | 特殊值      | 阻塞     | 超时                   |
| ---- | --------- | -------- | ------ | -------------------- |
| 插入   | add(e)    | offer(e) | put(e) | offer(e, time, unit) |
| 移除   | remove()  | poll()   | take() | poll(time, unit)     |
| 检查   | element() | peek()   | 不可用    | 不可用                  |

poll 移除并返问队列头部的元素 如果队列为空

take 获取并移除此队列的头部，如果队列为空，则阻塞

peek 返回队列头部的元素  如果队列为空，则返回null

drainTo(Collection<? super E> c) 移除此队列中所有可用的元素，并将它们添加到给定 collection 中

## BlockingQueue实现类

### SynchronousQueue

同步的阻塞队列，其中每个插入操作必须等待另一个线程的对应移除操作 ，等待过程一直处于阻塞状态，反之亦然。同步队列没有任何内部容量。

不能在同步队列上进行 `peek`，因为仅在试图要移除元素时，该元素才存在；除非另一个线程试图移除某个元素，否则也不能插入元素；也不能迭代队列，因为其中没有元素可用于迭代。队列的*头* 是尝试添加到队列中的首个已排队插入线程的元素；如果没有这样的已排队线程，则没有可用于移除的元素并且 `poll()` 将会返回 `null`。对于其他 `Collection` 方法（例如 `contains`），`SynchronousQueue` 作为一个空 collection。此队列不允许 `null` 元素。 

同步队列类似于 CSP 和 Ada 中使用的 rendezvous 信道。它非常适合于传递性设计，在这种设计中，在一个线程中运行的对象要将某些信息、事件或任务传递给在另一个线程中运行的对象，它就必须与该对象同步。 

对于正在等待的生产者和使用者线程而言，此类支持可选的公平排序策略。默认情况下不保证这种排序。但是，使用公平设置为 `true` 所构造的队列可保证线程以 FIFO 的顺序进行访问

### ArrayBlockingQueue

原理：使用一个可重入锁和这个锁生成的两个条件对象进行并发控制

ArrayBlockingQueue是基于数组的有界阻塞队列，初始化的时候必须要指定队列长度，`且指定长度之后不允许进行修改`。

队列按FIFO原则对元素进行排序，队列头部是在队列中存活时间最长的元素，队尾则是存在时间最短的元素。

ArrayBlockingQueue构造方法可通过设置fairness参数来选择是否采用公平策略，如果公平参数被设置true，等待时间最长的线程会优先得到处理(队列头部)，公平性通常会降低吞吐量，但也减少了可变性和避免了“不平衡性”，可根据情况来决策。

内部构成

```java
//内部数组结构
final Object[] items;
//头部指针
int takeIndex;
//尾部指针
int putIndex;
//总数
int count;
/** Main lock guarding all access */
final ReentrantLock lock;
/** Condition for waiting takes */
private final Condition notEmpty;
/** Condition for waiting puts */
private final Condition notFull;
public ArrayBlockingQueue(int capacity, boolean fair) {
  if (capacity <= 0)
    throw new IllegalArgumentException();
  this.items = new Object[capacity];
  lock = new ReentrantLock(fair);
  notEmpty = lock.newCondition();
  notFull =  lock.newCondition();
}
```
添加元素，在添加的时候使用锁保证线程安全，put 方法通过while循环控制notEmpty condition的await实现阻塞等待。
```java
//同理是添加
public void put(E e) throws InterruptedException {
  checkNotNull(e);
  final ReentrantLock lock = this.lock;
  lock.lockInterruptibly();
  try {
    while (count == items.length)
      notFull.await();
    enqueue(e);
  } finally {
    lock.unlock();
  }
}
//加入队列 个数+1 激活notEmpty
private void enqueue(E x) {
  final Object[] items = this.items;
  items[putIndex] = x;
  if (++putIndex == items.length)
    putIndex = 0;
  count++;
  notEmpty.signal();
}
public boolean offer(E e, long timeout, TimeUnit unit)
  throws InterruptedException {
  checkNotNull(e);
  long nanos = unit.toNanos(timeout);
  final ReentrantLock lock = this.lock;
  lock.lockInterruptibly();
  try {
    while (count == items.length) {
      if (nanos <= 0)
        return false;
      nanos = notFull.awaitNanos(nanos);
    }
    enqueue(e);
    return true;
  } finally {
    lock.unlock();
  }
}
```
检查是否存在元素，element 是对 peek 的封装
```java
//获取队列头
public E peek() {
  final ReentrantLock lock = this.lock;
  lock.lock();
  try {
    return itemAt(takeIndex); //获取队列头 null when queue is empty
  } finally {
    lock.unlock();
  }
}
public E element() {
  E x = peek();
  if (x != null)
    return x;
  else
    throw new NoSuchElementException();
}
```
取走一个元素，在取走的时候使用锁保证线程安全，take方法通过while循环控制notEmpty condition的await实现阻塞等待。
```java
//take是基于ReentrantLock中两个条件进行await
public E take() throws InterruptedException {
  final ReentrantLock lock = this.lock;
  //如果获取了锁定立即返回，如果没有获取锁定，当前线程处于休眠状态，直到或者锁定，或者当前线程被别的线程中断
  lock.lockInterruptibly();
  try {
    while (count == 0)
      notEmpty.await();//一直为空的时候 notEmpty 等待
    return dequeue();//唤醒notFull
  } finally {
    lock.unlock();
  }
}
//队列-1，并返回头部元素，激活notFull
private E dequeue() {
  final Object[] items = this.items;
  @SuppressWarnings("unchecked")
  E x = (E) items[takeIndex];
  items[takeIndex] = null;
  if (++takeIndex == items.length)
    takeIndex = 0;
  count--;
  if (itrs != null)
    itrs.elementDequeued();//获取头部element
  notFull.signal();//唤醒notFull
  return x;
}
public E poll(long timeout, TimeUnit unit) throws InterruptedException {
  long nanos = unit.toNanos(timeout);
  final ReentrantLock lock = this.lock;
  lock.lockInterruptibly();
  try {
    while (count == 0) {
      if (nanos <= 0)
        return null;
      nanos = notEmpty.awaitNanos(nanos);//停止一段时间
    }
    return dequeue();
  } finally {
    lock.unlock();
  }
}
public E remove() {
  E x = poll();
  if (x != null)
    return x;
  else
    throw new NoSuchElementException();
}
```

### LinkedBlockingQueue

LinkedBlockingQueue是一个使用单向循环链表完成队列操作的阻塞队列。

内部使用放锁和拿锁，这两个锁实现阻塞(“two lock queue” algorithm)。添加数据和删除数据是可以并行进行的，当然添加数据和删除数据的时候只能有1个线程各自执行

容量默认为Integer.MAX_VALUE，但是也可以选择指定其最大容量，此队列按 FIFO（先进先出）排序元素。**基于链表的队列吞吐量通常要高于基于数组的队列。**

内部结构

```java
//元素结构
static class Node<E> {
  E item;
  //单向
  Node<E> next;
  Node(E x) { item = x; }
}
//长度
private final AtomicInteger count = new AtomicInteger();
//头指针
transient Node<E> head;
//尾指针
private transient Node<E> last;
//读锁
private final ReentrantLock takeLock = new ReentrantLock();

private final Condition notEmpty = takeLock.newCondition();
//写锁
private final ReentrantLock putLock = new ReentrantLock();

private final Condition notFull = putLock.newCondition();
```
添加元素
```java
public void put(E e) throws InterruptedException {
        if (e == null) throw new NullPointerException();
        // holding count negative to indicate failure unless set.
        int c = -1;
        Node<E> node = new Node<E>(e);
        final ReentrantLock putLock = this.putLock;
        final AtomicInteger count = this.count;
        putLock.lockInterruptibly();
        try {
            // count在写里面使用同一个锁，取得时候用的另一个锁，写的时候判断长度
            while (count.get() == capacity) {
                notFull.await();
            }
            enqueue(node);
          	//添加完之后再次判断，如果没满，激活其他写线程
            c = count.getAndIncrement();
            if (c + 1 < capacity)
                notFull.signal();
        } finally {
            putLock.unlock();
        }
  		/// 没太明白 
        if (c == 0)
            signalNotEmpty();
    }
```

### PriorityBlockingQueue 

基于优先级的无界阻塞队列，PriorityQueue保存队列元素的顺序不是按加入队列的顺序，而是按队列元素的大小进行重新排序。PriorityQueue中的元素可以默认自然排序（也就是数字默认是小的在队列头，字符串则按字典序排列）或者通过提供的Comparator（比较器）在队列实例化时指定的排序方式。

当PriorityQueue中没有指定Comparator时，加入PriorityQueue的元素必须实现了Comparable接口（即元素是可比较的）

该队列也没有上限（看了一下源码，PriorityBlockingQueue是对 PriorityQueue的再次包装，是基于堆数据结构的，而PriorityQueue是没有容量限制的，与ArrayList一样，所以在优先阻塞队列上put时是不会受阻的。虽然此队列逻辑上是无界的，但是由于资源被耗尽，所以试图执行添加操作可能会导致 OutOfMemoryError），但是如果队列为空，那么取元素的操作take就会阻塞，所以它的检索操作take是受阻的。无限的add会导致内存溢出

从 iterator() 返回的 Iterator 实例不需要以优先级顺序返回元素。如果必须以优先级顺序遍历所有元素，那么让它们都通过 toArray() 方法并自己对它们排序，像 Arrays.sort(pq.toArray())。

### DelayQueue

基于PriorityQueue来实现的,是一个存放Delayed 元素的无界阻塞队列，只有在延迟期满时才能从中提取元素。该队列的头部是延迟期满后保存时间最长的 Delayed 元素。如果延迟都还没有期满，则队列没有头部，并且poll将返回null。当一个元素的 getDelay(TimeUnit.NANOSECONDS) 方法返回一个小于或等于零的值时，则出现期满，poll就以移除这个元素了。此队列不允许使用 null 元素。 

## Deque

Queue的一个子接口，双向队列是指该队列两端的元素既能入队(offer)也能出队(poll),如果将Deque限制为只能从一端入队和出队，则可实现栈的数据结构。对于栈而言，有入栈(push)和出栈(pop)，遵循先进后出原则

### ArrayDeque

实现Deque接口，内部是一个循环数组，可动态扩展，ArrayDeque不可以存取null元素，因为系统根据某个位置是否为null来判断元素的存在，