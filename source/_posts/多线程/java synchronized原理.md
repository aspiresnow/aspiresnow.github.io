---
title: java synchronized原理
date: 2017-09-01
tags:
- 多线程
categories:
- java基础

---

#  java synchronized原理

## 思考

- 当synchronized加的是偏向锁或者轻量级锁的时候，调用 wait方法会怎样
  - 对象的wait方法要依赖Monitor对象的实现，而且需要有个队列来存储阻塞等待的线程，偏向锁和轻量级锁都不涉及线程的阻塞，所以，我猜测会进行锁膨胀为重量级锁，然后调用Monitor对象的wait方法
- 为什么重量级锁叫锁膨胀
  - 重量级锁会将对象头Mark World指向一个Monitor对象，Monitor对象更像是对象头的补充，在该对象中存储了持有锁的线程ID、阻塞线程队列、等待线程队列，当这俩队列中有信息时，这个Monitor对象就得一直挂在对象头上。就像是对对象要实现锁功能的补充，所以叫锁膨胀
- 假如一个重入3次的线程调用wait方法，怎么处理
  - 当前线程阻塞，并加入到Monitor的等待队列，节点Node至少要有两个信息，一个线程ID，一个重入次数

## 知识导读

- synchronized方法依赖标记flag为ACC_SYNCHRONIZED，同步代码块依赖monitorenter和monitorexit指令
- synchronized在获锁的过程中是不能被中断的，意思是说如果产生了死锁，则不可能被中断
- 同步方法、同步代码块中抛出异常，锁自动释放
- synchronized是可重入的非公平锁实现
- 无锁、偏向锁、轻量级锁不会出现线程阻塞的情况，这也是JVM优化的最重要的一个目的
- 无锁、偏向锁、轻量级锁、自旋锁、重量级锁的优化场景及锁升级过程
- 锁对象的方法实现依赖Monitor对象的实现，Monitor对象依赖操作系统的Mutex互斥锁实现
- Monitor对象可以类比AQS，封装了持有锁的线程，被阻塞线程队列、等待线程队列、重入次数等信息

## 对象锁

Java 中的每一个对象都可以作为锁

- 对于同步方法，锁是当前实例对象。
- 对于同步方法块，锁是 Synchonized 括号里配置的对象。
- 对于静态同步方法，锁是当前对象的 Class 对象。

对象在内存的分布分为3个部分：对象头，实例数据，和对齐填充。在对象头中的Mark Word存储了对象的锁信息。Java中锁对象有四种状态，**无锁状态，偏向锁状态，轻量级锁状态和重量级锁状态**，它会随着竞争情况逐渐升级。锁可以升级但不能降级，目的是为了提高获得锁和释放锁的效率

![TrB4lz](https://raw.githubusercontent.com/aspiresnow/aspiresnow.github.io/hexo/source/blog_images/2020/08/TrB4lz.png)

## 原理

**synchronized方法**

javap查看synchronized方法会被编译成方法的flags加上标志ACC_SYNCHRONIZED.

线程执行方法时会检查方法的`ACC_SYNCHRONIZED`标志，如果设置了线程需要先去获取对象锁，执行完毕后线程再释放对象锁，在方法执行期间，同一时刻只有一个线程能成功获取锁

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

**synchronized代码块**

javap查看同步块的入口位置和退出位置分别插入monitorenter和monitorexit字节码指令。原理同synchronized方法一致

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

### 内存语义

- 当线程获取锁时，JMM会把该线程对应的本地内存置为无效，同步代码块必须去主内存读取所需的共享变量。
- 当线程释放锁时，JMM会将当前线程工作内存中的共享变量刷新到主内存中

## 优化

synchronized重量级锁依赖操作系统的mutex互斥锁实现，需要阻塞线程，由于线程的阻塞和重启涉及CPU内核切换，非常耗费性能，Jdk1.6之后针对synchronized做了一些优化，来降低线程阻塞的几率，主要包括如锁粗化、锁消除、轻量级锁、偏向锁、适应性自旋、重量级锁等技术来减少锁操作的开销。

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/sync5.jpg?raw=true)

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/synclock.png?raw=true)

### 无锁

无锁没有对资源进行锁定，所有的线程都能访问并修改同一个资源，但同时只有一个线程能修改成功。

无锁的实现主要依赖CAS操作，一般在一个循环中不断的进行CAS操作直到成功。循环次数过多会导致CPU负载升高

### 偏向锁

锁对象头`Mark Word`中会记录偏向线程ID，线程获取锁的时候会判断偏向线程ID是否是本线程，如果是直接获取执行权，不需要进行CAS操替换对象头或者其他加锁操作，提高了效率

- 线程成功获取偏向锁后修改`Mark Word`记录偏向线程ID,同时修改`Mark Word`中偏向锁标志为1
- 线程执行完成退出同步代码块后，只修改`Mark Word`中偏向锁标志为0，对象头中的偏向线程ID继续保留，下次直接比对，同一线程无需CAS替换

#### 优化背景

偏向锁的目的是消除无竞争情况下的加锁操作。大多数情况下锁不存在竞争，总是由同一个线程操作锁，通过在对象头记录偏向锁id，避免对象头的CAS替换操作

#### 加锁

1. 检查锁对象头的Mark Word是否为锁状态是否是01，即无锁或者偏向锁
   1. 如果锁状态不是01，进入轻量级锁或者重量级锁加锁流程
   2. 如果是01，可偏向锁，检查`Mark Word`储存的偏向线程ID是否为当前线程ID
      1. 如果存储的偏向线程ID为空，CAS将Mark Word偏向线程ID设置为本线程，CAS成功设置偏向锁标志为1，偏向锁加锁成功
      2. 如果是当前线程ID，当前线程直接获取到锁，修改Mark Word中偏向锁标志为1，执行代码
      3. 如果对象头存储的偏向线程ID不是当前线程ID，判断对象头的偏向锁标志值
         1. 如果偏向锁标志为 0，表示当前没有偏向锁，CAS将Mark Word偏向线程ID设置为本线程，CAS成功设置偏向锁标志为1，偏向锁加锁成功
         2. 如果偏向锁标志为 1，表示当前有其他线程添加了偏向锁，进入释放偏向锁并升级为轻量级锁流程

#### 释放锁

**偏向锁使用了一种等到竞争出现才释放锁的机制**，持有偏向锁的线程不会主动释放偏向锁，需要等待其他线程来竞争的时候才会释放偏向锁。当前线程竞争偏向锁时，进入以下流程

1. 当前线程检查持有偏向锁的线程是否还存活
   1. 偏向锁线程不处于活动状态，将对象头设置为无锁状态，清除`Mark Word`中的偏向ID，设置偏向锁标志为0，当前线程进入获取偏向锁流程
   2. 偏向锁线程处于活动状态，升级为轻量级锁。
      1. 当到达全局安全点(在这个时间点上没有字节码正在执行)时挂起持有偏向锁的线程
      2. 将`Mark Word`指向当前堆栈最近的一个lock record，**即指向拥有偏向锁线程的栈空间**
      3. 将对象头锁状态修改为`00`,升级为轻量级锁
      4. **恢复被挂起的线程**，**持有偏向锁的线程获取执行权**，当前线程CAS自旋获取轻量级锁

**注意：**在竞争激烈的时候，偏向锁会成为一种累赘，要频繁的暂停线程，可以通过设置 `-XX:UseBiasedLocking=false`关闭偏向锁功能

### 轻量级锁

在当前线程的栈帧中开辟一块锁记录（Lock Record）的空间，拷贝锁对象目前的Mark Word到栈帧的Lock Record，将使用CAS操作尝试将对象的`Mark Word`指向Lock Record。如果修改对象头成功，则加锁成功，如果失败，表示其他线程占用轻量级锁，那么当前线程会自旋尝试CAS更新`Mark Word`，自旋一定次数还没成功则膨胀为重量级锁

#### 优化背景

大部分占用锁时间不会太长，通过短暂的自旋后可以获取到锁，避免线程阻塞和唤醒。轻量级锁通过简单的将对象头指向持有锁的栈来标记加锁成，当发生竞争时，先自旋CAS更新`Mark World`指向本线程来竞争锁。

#### 加锁

1. 判断锁对象`Mark Word`中存储的锁记录是否指向当前线程栈帧
   1. 如果指向当前线程栈帧，说明是重入锁，当前线程直接获取执行权
   2. 如果没有指向当前线程栈帧，说明其他线程已经获取了轻量级锁。在当前线程栈帧中开辟锁记录空间，用于存放锁对象中的`Mark Word`的拷贝(Displaced Mark Word),CAS将锁对象的`Mark Word`指向当前栈空间的锁记录
      1. CAS更新成功，成功获取轻量级锁，将`Mark Word`的锁标志置为00，执行同步代码块
      2. CAS更新失败，进入自旋锁流程，当前线程尝试使用自旋来获取锁，直到获取到锁或者升级为重量级锁后阻塞当前线程

#### 释放锁

1. 从当前线程的栈帧中取出Displaced Mark Word存储的锁记录的内容
2. 当前线程尝试使用CAS将锁记录中复制的`Displaced Mark Word`替换到锁对象中的`Mark Word`中 
   1. CAS更新成功，则释放锁成功，释放轻量级锁，将锁标志位置为01无锁状态
   2. CAS更新失败，对象头已经由其他竞争的线程修改为10，Mark World已经膨胀指向Monitor对象，当前锁升级为重量级锁，所以当前线程需要执行重量级锁释放锁流程，请看下文

### 自旋锁

线程的阻塞和唤醒需要从用户态转换到核心态，这个状态之间的转换需要相对比较长的时间，时间成本相对较高，自旋锁就是避免线程进入阻塞状态。在大多数情况下，线程持有锁的时间都不会太长，所以希望通过短时间的重复尝试去获取锁，避免线程阻塞。

当线程在获取轻量级锁的过程中执行CAS更新`Mark World`失败时，为了避免线程真实地在操作系统层面挂起，虚拟机通过自旋不断尝试CAS更新`Mark World`。

1. 自旋若干次后，CAS修改`Mark World`成功则成功获取轻量级锁，线程获取执行权。
2. 自旋若干次后还是获取锁失败，当前线程进入阻塞状态，升级为重量级锁

**注意：**自旋等待虽然避免了线程切换的开销，但它要占用处理器时间。如果锁被占用的时间很短，自旋等待的效果就会非常好。反之，如果锁被占用的时间很长，那么自旋的线程只会白浪费处理器资源。所以，自旋等待的时间必须要有一定的限度，如果自旋超过了限定次数（默认是10次，可以使用-XX:PreBlockSpin来更改）没有成功获得锁，就应当挂起线程。

#### 自适应自旋锁　　

自旋是需要消耗CPU性能的，为了避免竞争激烈情况下无意义的自旋，JDK1.6引入自适应的自旋锁，自适应就意味着自旋的次数不再是固定的，它是由前一次在同一个锁上的自旋时间及锁的拥有者的状态来决定。线程如果自旋成功了，则下次自旋的次数会更多，如果自旋失败了，则自旋的次数就会减少。

1. 某个某个锁对象自旋成功获取轻量级锁，并且持有锁的线程正在运行中，那么虚拟机就会认为这次自旋也很有可能再次成功，进而它将允许自旋持续相对更长的时间。
2. 如果某个对象锁自旋很少成功获得，下次会减少自旋的次数，很快升级为重量级锁进入阻塞状态，避免CPU资源浪费

### 重量级锁

重量级锁涉及到了线程的阻塞，所以需要有一个容器队列来存储所有阻塞的线程。对象锁还支持wait方法，允许持有锁的线程释放锁并进入阻塞等待状态，也需要一个容器队列来存储所有阻塞等待的线程。Monitor就是做这件事的。通过将锁对象头的`Mark World`指向Monitor对象，实现对象头的补充膨胀效果。Monitor对象更像是对对象头的功能补充

重量级锁的实现是依靠Monitor对象实现，Monitor的本质是依赖于底层操作系统的MutexLock(互斥锁)实现，MutexLock会导致线程的阻塞和唤醒，操作系统实现线程之间的切换需要从用户态到内核态的转换，成本非常高。同时Monitor维护了持有锁线程、阻塞线程队列、阻塞等待线程队列、重入次数等信息

#### monitor锁对象

monitor是线程私有的数据结构，存储在栈中，每一个线程都有一个可用monitor列表，同时还有一个全局的可用列表，当线程可用monitor列表为空的时候会请求全局可用列表补充。？？？

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/sync2.jpg?raw=true)

**Owner**：初始时为NULL表示当前没有任何线程拥有该monitor，线程加锁成功后记录持有锁的线程ID，当锁释放后设置为NULL；
**EntryQ**: 链表，用于存储所有阻塞在该锁对象上的线程。存有两个队列，entry-set用于存储正在阻塞竞争的线程，wait-set用于存储调用wait方法等待唤醒的线程
**RcThis**: 表示所有阻塞或者等待在该锁对象上的线程个数
**Nest**:   记录锁对象重入的次数
**HashCode**: 保存从对象头拷贝过来的HashCode值
**Candidate**: 0表示没有需要唤醒的线程1表示要唤醒一个继任线程来竞争锁。

对象锁的API实现依赖Monitor的实现，Monitor提供了获取锁(enter)、释放锁(exit)、等待(wait)、notify(唤醒)、notifyAll(唤醒所有)功能

#### 加锁 

线程CAS自旋获取轻量级锁失败后，将锁膨胀为重量级锁

1. 从当前线程可用Monitor列表中取出一个Monitor对象，修改`Mark World`指向Monitor对象
2. 修改Monitor对象的Owner为持有轻量级锁的线程ID,Nest初始为1
3. 修改对象头的锁状态为重量级锁(10)
4. 当前线程加入到Monitor的entry-set队列中，进入阻塞状态

当一个新的线程来竞争重量级锁或者当阻塞队列中的线程被唤醒，竞争重量级锁

1. 当前线程判断对象头的锁状态为重量级锁(10)，然后根据`Mark World`引用获取Monitor对象
2. 当前线程调用Monitor对象的获取锁(enter)方法
   1. 如果Monitor锁没有被其他线程获取，当前线程成功获取锁，修改Monitro的Owner为当前线程
   2. 如果Monitor锁已经被其他线程获取，判断Owner是否为当前线程
      1. 如果相同，重入锁，Nest++，当前线程继续持有锁
      2. 如果不同，当前线程加入到entry-set中，进入阻塞状态

#### 释放锁

1. 将Monitor对象的Next字段减去 0 ,判断减去后的值是否为0(可能重入)
   1. Nest>0，说明重入锁还未释放锁，当前线程继续持有锁
   2. Next=0, 重入锁释放完成，设置Owner为空，检查rfThis是否大于0，用于判读是否需要唤醒被阻塞的线程
      1. rfThis>0，唤醒阻塞队列中一个被阻塞的线程，该线程竞争重量级锁
      2. rfThis=0，没有其他线程在竞争锁，也没有阻塞中的线程了，当前Monior已经没有用了，彻底释放锁，将`Mark World`指向为null，设置锁状态为01(无锁),将解除关联的monitor对象重新放入线程可用monitor列表中

### 锁粗化
在已经持有该对象锁的情况下，再次调用synchronized该对象，不再判断，如StringBuilder.append().apend()
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
### 锁消除

通过运行时JIT编译器的逃逸分析来消除一些没有操作共享变量的同步操作

```java
public void test1() {
  Vector vector = new Vector();
  vector.add("1");//vector本身属于线程私有的，调用add的时候会进行锁消除
  vector.add("2");
}
```





