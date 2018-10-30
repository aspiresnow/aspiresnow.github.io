---
title: java并发之LockSupport
date: 2017-11-16 18:53:41
tags:
- 多线程
categories:
- java基础
---

# java并发之LockSupport

LockSupport提供了park和unpark方法， 通过这两个方法实现线程的阻塞和唤醒，park和unpark方法类比suspend和resume方法，不过避免了这两个方法可能会出现的死锁问题。JUC包中的线程阻塞和唤醒都依赖LockSupport类。LockSupport底层是通过Unsafe实现线程的阻塞。

<!--more-->

## 实现

LockSupport和每个使用它的线程都与一个许可(permit)关联。permit相当于1，0的开关，默认是0，调用一次unpark就加1变成1，调用一次park会消费permit, 也就是将1变成0，同时park立即返回。再次调用park会变成block（因为permit为0了，会阻塞在这里，直到permit变为1）, 这时调用unpark会把permit置为1。每个线程都有一个相关的permit, **permit最多只有一个** ，重复调用unpark也不会积累。

park()和unpark()不会有 “Thread.suspend和Thread.resume所可能引发的死锁” 问题，由于许可的存在，调用 park 的线程和另一个试图将其 unpark 的线程之间的竞争将保持活性。

## park 阻塞

- park方法用于阻塞当前线程，当当前线程调用park后，在以下情况下会重新激活

   1. 该线程作为参数调用了 unpark(thread)
   2. 该线程被 interrupt ，打断
   3. park的时候指定了阻塞时间，超过该时间后，线程激活

- park底层基于UNSAFE的park方法,当time是绝对时间(到1970年的毫秒数)的时候，isAbsolute传true，当time是相对时间的时候，isAbsolute传false。当time为0时，表示一直阻塞，直到调用unpark或者当前线程被interrupt

  ```java
  public native void park(boolean isAbsolute, long time);
  ```

- 如果调用线程被中断，则park方法会返回。同时park也拥有可以设置超时时间的版本。

- park 还各自支持一个 blocker 对象参数。此对象在线程受阻塞时被记录，以允许监视工具和诊断工具确定线程受阻塞的原因。（这样的工具可以使用方法 getBlocker(java.lang.Thread) 访问 blocker。）建议最好使用这些形式，而不是不带此参数的原始形式。在锁实现中提供的作为 blocker 的普通参数是 this。

   该对象被LockSupport的getBlocker和setBlocker来获取和设置，且都是通过地址偏移量方式获取和修改的

   ```java
   public static void park(Object blocker) {
       Thread t = Thread.currentThread();
       setBlocker(t, blocker);
       UNSAFE.park(false, 0L);
       setBlocker(t, null);//线程被唤醒后重新将blocker设置为空
   }
   public static Object getBlocker(Thread t) {
     if (t == null)
       throw new NullPointerException();
     return UNSAFE.getObjectVolatile(t, parkBlockerOffset);
   }
   ```

- LockSupport提供parkNanos方法，支持阻塞一段时间后自动唤醒

   ```java
   public static void parkNanos(Object blocker, long nanos) {
       if (nanos > 0) {
           Thread t = Thread.currentThread();
           setBlocker(t, blocker);
           UNSAFE.park(false, nanos);
           setBlocker(t, null);
       }
   }
   ```

- LockSupport提供parkUntil方法，支持当前线程阻塞至某个时间点后自动唤醒

   ```java
   public static void parkUntil(long deadline) {
       UNSAFE.park(true, deadline);
   }
   ```

## unpark 唤醒

- unpark底层基于UNSAFE的unpark方法,调用该方法时需要保证该线程存活

  ```java
  public native void unpark(Thread thread);
  ```

- LockSupport中的unpark方法

  ```java
  public static void unpark(Thread thread) {
  	if (thread != null)//需要保证线程不为空
      	UNSAFE.unpark(thread);
  }
  ```

## interrupt唤醒

- interrupt可以使一个park后的线程唤醒，而不会抛出任何异常，同unpark唤醒的区别，只在于线程有了中断标识，一般在线程被激活后，通过Thread.interrupted()或者Thread.currentThread().isInterrupted()判断线程被唤醒的途径，然后进入不同的逻辑
- 当线程有中断标识的时候，调用park 线程是无法进入阻塞状态的。所以一般都是在死循环中调用park，每次唤醒都重复去判断是否获取到锁，防止是中断导致线程唤醒。如果是中断唤醒的，还要清除中断标识，调用Thread.interrupted

##  park\unpark和wait\notify区别

- 当线程启动后，在调用park之前，如果调用了unpark，该线程一样会被唤醒，当时如果在wait前面调用notify，该线程时无法被唤醒的。**注意** unpark只能抵消一次park，如果连续多次park，线程一样会处于阻塞状态

- wait和notify在调用前需要先持有对象锁，而park和unpark则没有这个要求

- park可以响应中断(interrupt)请求，而不会抛出异常，当线程从park被激活后，需要判断下线程时被unpark还是interrupt唤醒的，通过Thread.currentThread.isInterrupt() 来判断线程是否中断的同时清除中断标识，防止线程无法park，同时要记录下线程是被中断过的，在获取到锁后再调用interrupt，加上中断标识，用于后期的逻辑判断

  ```java
  //用于避免 interrupt导致唤醒线程
  while (waiters.peek() != current ||!locked.compareAndSet(false, true)) {
    LockSupport.park(this);
    //如果是interrupt导致唤醒线程，需要清除中断标记位，否则在循环中无法park线程
    if (Thread.interrupted()){
      wasInterrupted = true;//记录下 线程已经被中断，后期调用 thread.interrupt()
    }
  }
  ```

## 实例

```java
/**
 * 先进先出独占锁实现
 */
public class FIFOMutex {
    private final AtomicBoolean locked = new AtomicBoolean(false);
    private final Queue<Thread> waiters = new ConcurrentLinkedQueue<Thread>();

    public void lock() {
        boolean wasInterrupted = false;
        Thread current = Thread.currentThread();
        waiters.add(current);

        // 使用while循环，每次线程被唤醒则再次判断，防止并发问题
        // 先判断当前线程是否在队列头，然后再尝试加锁，保证FIFO
        while (waiters.peek() != current ||
                !locked.compareAndSet(false, true)) {
            LockSupport.park(this);
            //判断线程时是否是因为被打断而被唤醒的，设置wasInterrupted为true，等待拿到锁后再补上中断标识
            //使用interrupted清除中断标识，否则park将无法使线程进入阻塞状态
            if (Thread.interrupted())
//            if(current.isInterrupted())
                wasInterrupted = true;
        }

        waiters.remove();
        if (wasInterrupted)  //如果线程运行期间被中断过，重新中断当前线程
            current.interrupt();
    }

    public void unlock() {
        locked.set(false);  //释放锁
        LockSupport.unpark(waiters.peek());  //激活队列头部线程
    }
 }
```