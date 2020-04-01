---
title: java synchronized原理
date: 2017-09-01 16:52:24
tags:
- 多线程
categories:
- java基础

---

#  java synchronized原理

在java多线程编程中，最常用的加锁方式就是使用synchronized关键字。synchronized可以加在方法上、代码块上从而使方法和代码实现线程安全，当一个线程进入synchronized代码块后，其他线程会被阻塞在代码块外面，处于对象的锁池中，这时不再消耗cpu资源，等待对象锁的释放，然后从阻塞状态切换为可运行状态，参与竞争对象锁。

synchronized在获锁的过程中是不能被中断的，意思是说如果产生了死锁，则不可能被中断

<!--more-->

## synchronized使用方式

Synchronized本质上都是当前线程获取指定对象相关联的monitor对象，这个过程是互斥性的，也就是说同一时刻只有一个线程能够成功，其它失败的线程会被阻塞，并放入到锁池中，进入阻塞状态。

- synchronized代码块：

  javap查看同步块的入口位置和退出位置分别插入monitorenter和monitorexit字节码指令

  ```java
  public void test(){
    synchronized (this) {
      
    }
  }
  public void test();
      descriptor: ()V
      flags: ACC_PUBLIC
      Code:
        stack=2, locals=3, args_size=1
           0: aload_0
           1: dup
           2: astore_1
           3: monitorenter
           4: aload_1
           5: monitorexit
           6: goto          14
           9: astore_2
          10: aload_1
          11: monitorexit
          12: aload_2
          13: athrow
          14: return
            
  ```

  

- synchronized方法

  javap查看synchronized方法会被编译成方法的flags加上标志ACC_SYNCHRONIZED，在Class文件的方法表中将该方法的access_flags字段中的synchronized标志位置1，表明该方法使用自身对象或者自身Class对象作为锁对象

  ```java
  public synchronized void test(){
    System.out.println("test");
  }

  public synchronized void test();
      descriptor: ()V
      flags: ACC_PUBLIC, ACC_SYNCHRONIZED
      Code:
        stack=0, locals=1, args_size=1
           0: return
  ```

  

## synchronized对内存空间的影响

- 进入synchronized同步代码块后，JVM会把该线程对应的本地内存置为无效，从而强制线程去主内存读取共享数据。
- 出synchronized同步代码块前，线程会将当前工作内存中的缓存写入主内存。

## synchronized锁优化

由于线程的阻塞和重启涉及CPU内核切换，非常耗费性能，Jdk1.6之后针对synchronized做了一些优化，主要包括如锁粗化、锁消除、轻量级锁、偏向锁、适应性自旋、重量级锁等技术来减少锁操作的开销。

**锁粗化：**在已经持有该对象锁的情况下，再次调用synchronized该对象，不再判断，如StringBuilder.append().apend()

```java
public void test() {
  synchronized (this) {
    System.out.println("a");
  }
  synchronized (this) {//优化后不再阻塞
    System.out.println("b");
  }
}
```

**锁消除：**通过运行时JIT编译器的逃逸分析来消除一些没有操作共享变量的同步操作

```java
public void test1() {
  Vector vector = new Vector();
  vector.add("1");//vector本身属于线程私有的，调用add的时候会进行锁消除
  vector.add("2");
}
```

偏向锁：**当线程访问同步方法或者同步代码块的时候，会先判断对象头存储的线程是否为当前线程，而不需要进行CAS操作进行加锁和解锁，避免轻量级锁。**用于处理只有一个线程进入同步块中的情况**

**轻量级锁：**假设大部分同步代码一般都处于无锁竞争状态，在无竞争的情况下应该尽量避免使用锁，取而代之的是在monitorenter和monitorexit中只需要依靠一条CAS原子指令就可以完成锁的获取及释放。当存在锁竞争的情况下，执行CAS指令失败的线程将调用操作系统互斥锁进入到阻塞状态，当锁被释放的时候被唤醒。**用于处理多个线程交替进入同步块的情况**

**适应性自旋：**当线程在获取轻量级锁的过程中执行CAS操作失败时，升级为重量级锁，当前线程会自旋，自旋一定时间再次尝试获取锁，成功则避免进入阻塞状态，减少CPU的切换消耗，如果自旋后尝试还是无法获取则进入阻塞状态，等待其他线程释放对象锁。java虚拟机内部会对自旋的次数自动调整，如果上次自旋后成功获取锁则减少下次自旋次数，如果自旋后还是无法获取到对象锁，会减少下次的自旋字数，避免在自旋长期占用CPU资源。

**重量级锁**：**用于多个线程同时进入同步块的情况**

## 锁优化实现原理

### java 对象头

在java中每个对象都可以作为一个锁，继承Object中的wait和notify方法，在hotspot虚拟机中，对象在内存的分布分为3个部分：对象头，实例数据，和对齐填充。在对象头中的Mark Word存储了对象的锁信息，Mark Word被设计成一个非固定的数据结构以便在极小的空间内存存储尽量多的数据，它会根据对象的状态复用自己的存储空间，也就是说，Mark Word会随着程序的运行发生变化，变化状态如下

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/sync1.jpg?raw=true)

### monitor锁对象

**monitor是线程私有的数据结构，存储在栈中**，每一个线程都有一个可用monitor列表，同时还有一个全局的可用列表，当线程可用monitor列表为空的时候会请求全局可用列表补充。

在 java 虚拟机中，线程一旦进入到被synchronized修饰的方法或代码块时，指定的锁对象的对象头存储指向monitor对象的指针，这个过程称为锁对象的膨胀。同时monitor 中的Owner存放拥有该对象锁的线程的唯一标识，确保一次只能有一个线程执行该部分的代码，线程在获取锁之前不允许执行该部分的代码。

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/sync2.jpg?raw=true)

**Owner**：初始时为NULL表示当前没有任何线程拥有该monitor record，当线程成功拥有该锁后保存持有锁的线程唯一标识，当锁被释放时又设置为NULL；

**EntryQ**:关联一个系统互斥锁（semaphore），阻塞所有试图锁住monitor record失败的线程。

**RcThis**:表示blocked或waiting在该monitor record上的所有线程的个数。

**Nest**:用来实现重入锁的计数。

**HashCode**:保存从对象头拷贝过来的HashCode值（可能还包含GC age）。

**Candidate**:用来避免不必要的阻塞或等待线程唤醒，因为每一次只有一个线程能够成功拥有锁，如果每次前一个释放锁的线程唤醒所有正在阻塞或等待的线程，会引起不必要的上下文切换（从阻塞到就绪然后因为竞争锁失败又被阻塞）从而导致性能严重下降。Candidate只有两种可能的值0表示没有需要唤醒的线程1表示要唤醒一个继任线程来竞争锁。

Java中锁有四种状态，**无锁状态，偏向锁状态，轻量级锁状态和重量级锁状态**，它会随着竞争情况逐渐升级。锁可以升级但不能降级，目的是为了提高获得锁和释放锁的效率。

### 偏向锁

**引入背景**：Hotspot 的作者经过以往的研究发现大多数情况下锁不仅不存在多线程竞争，而且总是由同一线程多次获得，为了让线程获得锁的代价更低而引入了偏向锁。当一个线程访问同步块并获取锁时，会在对象头和栈帧中的锁记录里存储锁偏向的线程 ID，以后该线程在进入和退出同步块时不需要花费CAS操作来加锁和解锁，而只需简单的测试一下对象头的Mark Word里是否存储着指向当前线程的偏向锁，如果测试成功，表示线程已经获得了锁，如果测试失败，则需要再测试下 Mark Word中偏向锁的标识是否设置成 1（表示当前是偏向锁），如果没有设置，则使用 CAS 竞争锁，如果设置了，则尝试使用 CAS 将对象头的偏向锁指向当前线程。

```java
public static void main(String[] args) {
  method1();
  method2();
}
synchronized static void method1() {}
synchronized static void method2() {}
```

**加锁**：当Thread#1进入临界区时，JVM会将lockObject的对象头Mark Word的锁标志位设为“01”，同时会用CAS操作把Thread#1的线程ID记录到Mark Word中，此时进入偏向模式。所谓“偏向”，指的是这个锁会偏向于Thread#1，若接下来没有其他线程进入临界区，则Thread#1再出入临界区无需再执行任何同步操作。也就是说，若只有Thread#1会进入临界区，实际上只有Thread#1初次进入临界区时需要执行CAS操作，以后再出入临界区都不会有同步操作带来的开销。

然而情况一是一个比较理想的情况，更多时候Thread#2也会尝试进入临界区。若Thread#2尝试进入时Thread#1已退出临界区，即此时lockObject处于未锁定状态，这时说明偏向锁上发生了竞争（对应情况二），此时会撤销偏向，Mark Word中不再存放偏向线程ID，而是存放hashCode和GC分代年龄，同时锁标识位变为“01”（表示未锁定），这时Thread#2会获取lockObject的轻量级锁。因为此时Thread#1和Thread#2交替进入临界区，所以偏向锁无法满足需求，需要膨胀到轻量级锁。

**解除锁**：偏向锁使用了一种等到竞争出现才释放锁的机制，所以当其他线程尝试竞争偏向锁时，持有偏向锁的线程才会释放锁。偏向锁的撤销，需要等待全局安全点（在这个时间点上没有字节码正在执行），它会首先暂停拥有偏向锁的线程，然后检查持有偏向锁的线程是否活着，如果线程不处于活动状态，则将对象头设置成无锁状态，如果线程仍然活着，拥有偏向锁的栈会被执行，遍历偏向对象的锁记录，栈中的锁记录和对象头的Mark Word要么重新偏向于其他线程，要么恢复到无锁或者标记对象不适合作为偏向锁，最后唤醒暂停的线程。

![偏向锁](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/sync3.jpg?raw=true)

### 轻量级锁

**引入背景**：这种锁实现的背后基于这样一种假设，即在真实的情况下我们程序中的大部分同步代码一般都处于无锁竞争状态（即单线程执行环境），在无锁竞争的情况下完全可以避免调用操作系统层面的**重量级互斥锁**，取而代之的是在monitorenter和monitorexit中**只需要依靠一条CAS原子指令就可以完成锁的获取及释放**。当存在锁竞争的情况下，执行CAS指令失败的线程将调用操作系统互斥锁进入到阻塞状态，当锁被释放的时候被唤醒

**加锁**： 线程在执行同步块之前， 线程首先从自己的可用moniter record列表中取得一个空闲的monite对象，初始Nest和Owner值分别被预先设置为1和该线程自己的标识，并将对象头中的Mark Word复制到锁记录中，官方称为Displaced Mark Word。然后线程尝试使用 CAS 将对象头中的Mark Word替换为指向monitor对象的指针。如果成功，当前线程获得锁，如果失败，表示其他线程竞争锁，当前线程便尝试使用**自旋**来获取锁。,**如果有两条以上的线程争用同一个锁，那轻量级锁就不再有效，要膨胀为重量级锁，锁标志的状态值变为”10”，Mark Word中存储的就是指向重量级（互斥量）的指针。当达到一定的次数时如果仍然没有成功获得锁，则开始准备进入阻塞状态，将rfThis的值原子性的加1**

如果Mark Word中已经指向一个monitor对象，并且该monitor对象中的Owner中保存的线程标识是线程自己，这就是重入锁的情况，只需要简单的将Nest加1即可

**释放锁**:首先使用原子的 CAS 操作来将Displaced Mark Word替换回到对象头，如果成功，则表示没有竞争发生。如果失败，表示当前锁存在竞争，锁就会膨胀成重量级锁。

![轻量级锁](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/sync4.jpg?raw=true)



### 重量级锁

**加锁**：Mark Word标记为10，其他线程进入同步阻塞状态

**释放锁**：

1. 检查该对象是否处于膨胀状态并且该线程是这个锁的拥有者，如果发现不对则抛出异常。
2. 检查Nest字段是否大于1，如果大于1则简单的将Nest减1并继续拥有锁，如果等于1，则进入到步骤3。
3. 检查rfThis是否大于0，设置Owner为空然后唤醒一个正在阻塞或等待的线程再一次试图获取锁，如果等于0则进入到步骤4
4. 将对象头的LockWord置为空，解除和monitor对象的关联，释放对象锁，同时将这个空的monitor对象再次放入线程的可用monitor列表。        


### 总结

- 偏向锁、轻量级锁都是乐观锁，重量级锁是悲观锁。 没有任何线程来访问同步块的时候，对象锁是可偏向的，这意味着当有第一个线程进入同步块的访问锁对象的时候，会获取对象的偏向锁，这个线程在修改锁对象的对象头成为偏向锁的时候使用CAS操作，并将对象头中的ThreadID改成自己的ID，之后该线程再次访问该锁对象，只需要对比ID，不需要再使用CAS在进行操作。


- 一旦有第二个线程访问锁对象，因为偏向锁不会主动释放，所以第二个线程可以看到对象时偏向状态，这时表明在这个对象上已经存在竞争了，检查原来持有该对象锁的线程是否依然存活，如果挂了，则可以将对象变为无锁状态，然后重新偏向新的线程，如果原来的偏向的线程依然存活，则马上执行那个线程的操作栈，检查该对象的使用情况，如果仍然需要持有偏向锁，则偏向锁升级为轻量级锁，（**偏向锁就是这个时候升级为轻量级锁的**）。如果不存在使用了，则可以将对象回复成无锁状态，然后重新偏向。
- 轻量级锁认为竞争存在，但一般两个线程对于同一个锁的操作都会错开，或者存在竞争时线程进行几次**自旋**，另一个线程就会释放锁。 但是当自旋超过一定的次数后还无法获得对象锁，轻量级锁膨胀为重量级锁，重量级锁使除了拥有锁的线程以外的线程都阻塞，防止CPU空转。

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/sync5.jpg?raw=true)


## 参考资料

[深入浅出synchronized](http://www.jianshu.com/p/19f861ab749e)

[Java中synchronized的实现原理与应用](http://www.infoq.com/cn/articles/java-se-16-synchronized/)