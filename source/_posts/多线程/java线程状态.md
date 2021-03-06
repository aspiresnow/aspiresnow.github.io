---
title: java线程状态
date: 2017-09-01 12:51:24
tags:
- 多线程
categories:
- java基础

---

#  java线程状态

## 知识导读

-  JVM 实现都把 Java 线程一一映射到操作系统底层的线程上，把调度委托给了操作系统
- Thread类的线程状态 对应 操作系统层面的线程状态
- Thread类中 RUNNABLE 特殊性，运行、等待IO、等待CPU都属于RUNABLE
- **当线程进入I/O操作时，线程会被阻塞，释放CPU使用权，被放入等待队列中，当I\O操作完成后，CPU会收到硬盘的一个中断信号，将阻塞在该I/O的线程重新变为可运行状态，竞争获取CPU使用权**
- 当线程进入I/O阻塞时，对应的Thread类中线程状态为 RUNNABLE
- 阻塞类型分为三种 等待锁阻塞、需要依赖其他线程唤醒的阻塞、一定时间后自动唤醒的阻塞
- I/O阻塞等待类似sleep等待，都不会释放锁资源，一般都会有个超时限制

java中Thread类的状态

```java
public enum State {
    //新建未调用start方法
    NEW,
    //可运行状态，
    RUNNABLE,
    //阻塞状态，等待获取锁
    BLOCKED,
		//无限期等待状态
    WAITING,
    //有限期等待
    TIMED_WAITING,
    //死亡
    TERMINATED;
}
```

- NEW: 新建未调用start方法
- RUNNABLE : 可运行状态，在JVM层面可执行的线程，在操作系统层面可能在等待其他资源。如果等待的资源是CPU，在操作系统层面线程就是等待被CPU调度的Ready状态；如果等待的资源是磁盘网卡等IO资源，在操作系统层面线程就是等待IO操作完成的IO Wait状态。
- BLOCKED: 阻塞状态，线程在等待获取monitor lock。比如说进入一个synchronized代码块或者调用wait方法被notify重新等待获取monitor lock
- WAITING: 无限期等待状态，当前线程需要另外一个线程激活才能进入RUNABLE状态。通过调用了wait（等待其他线程notify）、join（等待目标线程死亡）、park（等待其他线程unpark）线程进入该状态
- TIMED_WAITING：有限期等待，当前线程等待一段时间后自动进入RUNABLE状态。通过调用 sleep(time)、wait(time)、join(time)、parkNanos(time)、parkUntil() 线程进入该状态
- TERMINATED

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/OmrCo1.png)

操作系统层面线程状态状态流转

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/cHx5kP.png)

### 线程间的状态转换:

1. **新建(new)**：一个new出来的线程对象，还未执行。
2. **就绪(runnable)**：线程对象创建并调用了该对象的**start()**方法后。该状态的线程位于可运行线程池中，等待被线程调度选中，获取cpu 的使用权 ，但是此时还未执行，处于就绪状态。
3. **运行(running)**：可运行状态(runnable)的线程获得了cpu 时间片（timeslice）,执行程序代码。
4. **阻塞(block)**：阻塞状态是指线程因为某种原因放弃了cpu 使用权，即让出了cpu时间片，暂时停止运行。直到线程进入可运行(runnable)状态，才有机会再次获得cpu时间片转到运行(running)状态。**阻塞和运行的切换涉及当前线程执行上下文内容的保存和恢复，非常耗费cpu资源**，阻塞的情况分三种： 
   - 等待阻塞：运行(running)的线程执行o.wait()方法，释放锁资源，JVM会把该线程放入等待队列(waitting queue)中。
   - 同步阻塞：运行(running)的线程在获取对象的同步锁时，若该同步锁被别的线程占用，则JVM会把该线程放入对象锁的锁池(lock pool)中。
   - 其他阻塞：运行(running)的线程执行Thread.sleep(long ms)或t.join()方法，或者发出了I/O请求时，JVM会把该线程置为阻塞状态，该状态不会释放锁资源。当sleep()状态超时、join()等待线程终止或者超时、或者I/O处理完毕时，线程重新转入可运行(runnable)状态。
5. **死亡(dead)**：线程run()、main() 方法执行结束，或者**因异常**退出了run()方法，则该线程结束生命周期。死亡的线程不可再次复生。

### 改变线程状态的行为

1. Thread.sleep(long millis)：一定是当前线程调用此方法，当前线程切换为**阻塞状态** ，但不释放对象锁，millis后线程自动苏醒切换为**就绪状态** 。

2. Thread.yield()：一定是当前线程调用此方法，当前线程放弃获取的cpu时间片，由**运行状态**切换到**就绪状态** ，可再次竞争CPU使用权。作用：让相同优先级的线程轮流执行，但并不保证一定会轮流执行。实际中无法保证**yield()**达到让步目的，因为让步的线程还有可能被线程调度程序再次选中。

3. obj.wait()：当前线程调用对象的wait()方法，当前线程释放对象锁，进入等待队列。依靠notify()/notifyAll()唤醒或者wait(long timeout)timeout时间到自动唤醒。

4. LockSupport.park():将当前线程置为等待状态，同wait的区别是无需获取对象锁，调用unpark方法唤醒

5. obj.notify()唤醒在此对象监视器上等待的单个线程，选择是任意性的。notifyAll()唤醒在此对象监视器上等待的所有线程。当线程调用notify()后只是激活其他线程，自己并不会释放对象锁，知道当前线程执行完毕后才释放对象锁。

6. t.join()/t.join(long millis)：当前线程里调用其它线程的join方法，当前线程阻塞，其实是以其他线程对象做为锁对象进入阻塞等待状态，直到这个线程**运行完毕死亡**之后释放锁进入**就绪状态**

   ```java
   //join方法的内部实现是通过wait方法
   while (isAlive()) {//判断调用join方法的线程是否依然存活，如果是，当前线程调用wait方法
      long delay = millis - now;
      if (delay <= 0) {
        break;
      }
      wait(delay);
      now = System.currentTimeMillis() - base;
    }
   ```
