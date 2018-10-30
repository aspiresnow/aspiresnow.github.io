---
title: java线程
date: 2017-09-01 11:51:24
tags:
- 多线程
categories:
- java基础
---

# java线程

在早期的操作系统中并没有线程的概念，进程是能拥有资源和独立运行的最小单位，也是程序执行的最小单位。任务调度采用的是时间片轮转的抢占式调度方式，而进程是任务调度的最小单位，每个进程有各自独立的一块内存，使得各个进程之间内存地址相互隔离。

后来，随着计算机的发展，对CPU的要求越来越高，进程之间的切换开销较大，已经无法满足越来越复杂的程序的要求了。于是就发明了线程，线程是程序执行中一个单一的顺序控制流程，是程序执行流的最小单元，是处理器调度和分派的基本单位。一个进程可以有一个或多个线程，各个线程之间共享程序的内存空间(也就是所在进程的内存空间)。一个标准的线程由线程ID、当前指令指针(PC)、寄存器和堆栈组成。而进程由内存空间(代码、数据、进程空间、打开的文件)和一个或多个线程组成。

## 两种创建线程的方式

- 继承Thread类覆写run方法

```java
Thread thread = new Thread()
{
  @Override
  public void run()
  { 
    System.out.println("执行线程");
  }
}
thread.start();
```

- 实现runnable接口

```java
new Thread(new Runnable()
           {
               @Override
               public void run()
               {
                   System.out.println("执行线程");
               }
           }
          ).start();
```

当一个线程既覆写了Thread的run方法，又实现类Runnable接口，那么是执行覆写的run方法还是执行Runnable接口中的run方法？答案是执行覆写的run方法，因为重写了run方法，不会再执行Thread中的run方法，也就不会执行到Runnable中的run方法

```java
@Override
public void run() {
  if (target != null) {
    target.run();
  }
}
```

建议使用实现Runnable接口,面向接口编程，同时线程池的情况下，如果是实现Runnable接口，可以把任务对象放入队列，等有空闲线程时再执行，如果是覆写Thread的run方法，导致创建一批Thread对象

## start与run区别

**start：** 启动线程，真正实现了多线程运行。这时此线程是处于就绪状态， 并没有运行。 然后通过此Thread类调用方法run()来完成其运行操作的， 这里方法run()称为线程体，它包含了要执行的这个线程的内容， run方法运行结束， 此线程终止,然后CPU再调度其它线程。

**run：** 方法当作普通方法被主线程调用，程序还是要顺序执行，要等待run方法体执行完毕后，才可继续执行下面的代码， 程序中只有主线程这一个线程。 

##  sleep 和 wait 区别


- **Thread.sleep ()** ：使当前线程在指定的时间处于阻塞状态。**线程一直持有对象的锁** 。如果另一线程调用了 interrupt ()方法，它将唤醒那个“睡眠的”线程。使用Thread调用，**只对当前线程有效** 。线程唤醒后直接进入可运行状态。
- **object.wait (long timeout)** ：使当前线程出于阻塞状态
  1. 不能使用Thread调用，只能使用object调用，
  2. 在调用wait前，**线程先要获取这个对象的对象锁，所以都是在同步代码块中调用wait** ，调用wait后，当前线程释放锁并把当前线程添加到等待队列中，随后另一线程B获取对象锁来调用 object.notify ()，将唤醒原来等待中的线程，线程B执行完毕后然后释放该锁。

## sleep和yield的区别

1. **sleep**方法暂停当前线程后，会给其他线程执行机会，不会理会线程的优先级。但**yield**则会给优先级相同或高优先级的线程执行机会,Thread.sleep(0)让某些优先级比较低的线程也能获取到CPU控制权,用于平衡CPU控制权
2. **sleep**方法会将线程转入**阻塞状态**，直到经过阻塞时间才会转入到就绪状态；而**yield**则只是强制当前线程进入**就绪状态**,不会将线程转入到阻塞状态,因此完全有可能调用yield方法暂停之后，立即再次获得处理器资源继续运行。
3. **sleep**声明抛出了InterruptedException异常，所以调用sleep方法时，要么捕获异常，要么抛出异常。而**yield**没有申明抛出任何异常

## join方法

join方法内部实现调用的wait方法，t1.join() 当前线程会以t1为对象锁，然后当前线程进行阻塞等待状态，当t1运行完毕后t1对象销毁，然后当前线程持有的锁也就失效 了，当前线程从阻塞状态进入就绪状态

以一个线程为对象锁，执行了wait方法之后，如果这个线程执行完毕会自动唤醒等待这个锁的线程

```java
public final synchronized void join(long millis)throws InterruptedException {//使用synchronize
  long base = System.currentTimeMillis();
  long now = 0;
  if (millis < 0) {
    throw new IllegalArgumentException("timeout value is negative");
  }
  if (millis == 0) {
    while (isAlive()) {//防止是被interrupt唤醒的情况，必须要等到线程销毁
      wait(0);
    }
  } else {
    while (isAlive()) {
      long delay = millis - now;
      if (delay <= 0) {
        break;
      }
      wait(delay);//进入阻塞状态
      now = System.currentTimeMillis() - base;
    }
  }
}
```



## 线程中断

由于stop线程太暴力，所以使用中断指令可以使线程更加优雅的做出停止动作，中断不会对线程做任务动作，只是和线程进行一次通信，发出一个中断信号，线程在运行区间可以收到中断信号

当线程wait后被interrupt，需要等待线程获到锁后才能响应中断

- t.interrupt():用于中断线程。调用该方法的线程的状态为将被置为"中断"状态。线程中断仅仅是置线程的中断状态位，不会停止线程。需要用户自己去监视线程的状态为并做处理。
- t.isInterrupted():用于判断线程是否被中断，调用该方法不会清除线程的中断状态，如果未true，多次调用还是true。
- Thread.interrupted ():用于判断当前线程的中断状态，调用该方法会清除线程的中断状态，如果线程第一次调用为true，被清除后，第二次调用返回false，除非对线程再次调用interrupt()
- sleep、wait状态的线程也可以响应中断，一旦线程被中断，会抛出InterruptedException，然后会jvm清除线程中断状态，所以在try catch中调用isInterrupted无法返回true，直接写逻辑就可以了。

```java
thread.interrupt();//调用线程中断
@Override
public void run() {
  synchronized (this) {
    while (true) {
      System.out.println(Thread.currentThread().getName() + ">>>>运行");
      if(Thread.currentThread().isInterrupted()){{//在运行区间，手动响应中断指示，做出反应
        System.out.println("thread is interrupted");
        break;
      }
    }
  }
}
  
 //sleep会抛出interruptException是希望线程在等待状态下也可以响应中断指令，从而做出
  try{
    Thread.sleep(2000);
  } catch (InterruptedException e) {
    System.out.println("Interruted When Sleep");
    //设置中断状态，抛出异常后会清除中断标记位，重新调用interrupt，在while中才能获取到中断标志
    Thread.currentThread().interrupt();
  }
```

## 线程优先级

线程默认的优先级是创建它的执行线程的优先级。可以通过setPriority(int newPriority)更改线程的优先级

线程优先级为1~10之间的正整数，JVM从不会改变一个线程的优先级。当设计多线程应用程序的时候，一定不要依赖于线程的优先级，因为JVM不会保证优先级高的线程先被执行，只是几率高

## 守护线程

在后台默默地完成一些系统性的服务，比如垃圾回收线程、JIT线程就可以理解为守护线程， 当一个Java应用内，只有守护线程时，Java虚拟机就会自然退出,如果前台的进程都死亡，那么后台进程也死亡

在创建线程的时候，如果父类线程是守护线程，那么子类默认也会是守护线程，在创建线程池使用默认线程工厂的话，会默认设置为非守护线程

```java
Thread t=new DaemonT();
t.setDaemon(true);//必须要在start前设置
t.start();

public Thread newThread(Runnable r) {
    Thread t = new Thread(group, r,namePrefix + threadNumber.getAndIncrement(),0);
    if (t.isDaemon())
        t.setDaemon(false);
    if (t.getPriority() != Thread.NORM_PRIORITY)
        t.setPriority(Thread.NORM_PRIORITY);
    return t;
}
```

## 线程安全

首先存在多个线程，操作共享变量，如果多个线程读共享变量不会发生线程安全问题，只有当多个线程同时对共享变量进行写操作的时候会发生线程安全问题

线程安全问题解决方案

- 避免操作共享变量
- 多读单一写
- 共享变量设计为不可变对象，如没有set方法
- CAS操作
- 加锁

## Callable接口

Future是jdk对Future模式的实现，Future模式的核心就是异步

FutureTask 实现了 Runnable 和 Future，所以兼顾两者优点，既可以在 Thread 中使用，又可以在 ExecutorService 中使用。

```java
Callable<String> callable = new Callable<String>() {
    @Override
    public String call() throws Exception {
        return "test";
    }
};
FutureTask<String> task = new FutureTask<String>(callable);
Thread t = new Thread(task);
t.start(); // 启动线程
task.cancel(true); // 取消线程
```

使用 FutureTask 的好处是 FutureTask 是为了弥补 Thread 的不足而设计的，它可以让程序员准确地知道线程什么时候执行完成并获得到线程执行完成后返回的结果。FutureTask 是一种可以取消的异步的计算任务，它的计算是通过 Callable 实现的，它等价于可以携带结果的Runnable，并且有三个状态：等待、运行和完成。完成包括所有计算以任意的方式结束，包括正常结束、取消和异常。