---
title: volatile修饰符详解
catalog: 保证内存可见性
date: 2017-09-01 14:51:24
subtitle: ""
header-img: 
tags:
- 多线程
categories:
- java基础

---

# volatile修饰符详解

java编程语言允许线程访问共享变量，为了确保共享变量能被准确和一致的更新，线程应该确保通过排他锁单独获得这个变量。Java语言提供了volatile，在某些情况下比锁更加方便。如果一个字段被声明成volatile，java线程内存模型确保所有线程看到这个变量的值是一致的。

<!--more-->

## volatile 作用

- 保证内存可见性
- 防止指令重排,有序性
- 不能解决原子性

## CPU内存

计算机在执行程序时，每条指令都是在CPU中执行的，而执行指令过程中，势必涉及到数据的读取和写入。由于程序运行过程中的临时数据是存放在主存（物理内存）当中的，这时就存在一个问题，由于CPU执行速度很快，而从内存读取数据和向内存写入数据的过程跟CPU执行指令的速度比起来要慢的多，因此如果任何时候对数据的操作都要通过和内存的交互来进行，会大大降低指令执行的速度。因此在CPU里面就有了高速缓存。也就是，当程序在运行过程中，会将运算需要的数据从主存复制一份到CPU的高速缓存当中，那么CPU进行计算时就可以直接从它的高速缓存读取数据和向其中写入数据，当运算结束之后，再将高速缓存中的数据刷新到主存当中,如果一个变量在多个CPU中都存在缓存（一般在多线程编程时才会出现），那么就可能存在缓存不一致的问题

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/ts3.jpg?raw=true)

## java内存模型

java中多线程共享的变量存储在主内存中，处理器CPU为了提高执行效率，每个线程都有自己的工作内存，工作内存保存了主内存的副本，线程要操作共享变量，实际操作的是线程工作内存的副本，操作完毕后再同步写入主内存，各个线程线程只能访问自己的工作内存，不可以访问其它线程的工作内存。

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/ts4.png?raw=true)
									`java中线程工作内存跟主内存的交互`

Java内存模型规定了工作内存与主内存之间交互的协议，首先是定义了8种原子操作：

1. lock:将主内存中的变量锁定，为一个线程所独占，使用syncronize或者lock的时候
2. unclock:将lock加的锁定解除，此时其它的线程可以有机会访问此变量，释放锁
3. read:将主内存中的变量值读到线程的工作内存当中
4. load:将线程工作内存中的变量指向将read读取的值的。
5. use:将值传递给线程的代码执行引擎(多次)
6. assign:将执行引擎处理返回的值重新赋值给变量副本
7. store:将变量副本的值存储到主内存中。
8. write:将主内存的共享变量指向store存储的值。

Java内存模型也针对这些操作指定了必须满足的规则:

1. read和load、store和write必须要成对出现，不允许单一的操作，否则会造成从主内存读取的值，工作内存不接受或者工作内存发起的写入操作而主内存无法接受的现象。
2. 在线程中使用了assign操作改变了变量副本，那么就必须把这个副本通过store-write同步回主内存中。如果线程中没有发生assign操作，那么也不允许使用store-write同步到主内存。
3. 在对一个变量实行use和store操作之前，必须实行过load和assign操作。
4. 变量在同一时刻只允许一个线程对其进行lock,有多少次lock操作，就必须有多少次unlock操作。在lock操作之后会清空此变量在工作内存中原 先的副本，需要再次从主内存read-load新的值。在执行unlock操作前，需要把改变的副本同步回主存。

**共享变量使用volatile修饰后，保证线程每次访问共享变量都去主内存获取，保证每次写入都会写回主内存**

### 内存可见性与原子性

**可见性：** 指当多个线程访问同一个变量时，一个线程修改了这个变量的值，其他线程能够立即看得到修改的值。保证线程每次使用共享变量时都去主内存获取最新的，保证了read-load的一致性

**原子性：** 指在一个操作中就是cpu不可以在中途暂停然后再调度，既不被中断操作，要不执行完成，要不就不执行。保证线程在read-load-use-assign-store-write共享变量过程中，其它线程不能对主内存的共享变量进行修改，这时就需要lock主内存的变量，操作完毕后unlock

> 如果一个字段被声明成volatile，java线程内存模型确保所有线程看到这个变量的值是一致的。

### 防止指令重排

**指令重排序**: JVM为了优化指令，提高程序运行效率，在不影响**单线程**程序执行结果的前提下，尽可能地提高并行度，会对代码执行顺序进行调整。在单线程下没问题，多线程的情况下指令重排序会带来许多麻烦。

**内存屏障：**使用volatile后，会在该变量指令前后加入一个内存屏障，用于实现对内存操作的顺序限制。保证在volatile修饰的变量指令前的指令行无论顺序怎么变一定在volatile变量前全部执行，在volatile变量指令后的指令行无论顺序怎么变，都一定在volatile变量指令执行完后才执行。

lock前缀指令实际相当于一个内存屏障，内存屏障提供了以下功能：

> 1 . 重排序时不能把后面的指令重排序到内存屏障之前的位置 
>
> 2 . 使得本CPU的Cache写入内存 
>
> 3 . 写入动作也会引起别的CPU或者别的内核无效化其Cache，相当于让新写入的值对别的线程可见。

```java
//线程1初始化User
User user;
user = new User();
//线程2读取user
if(user!=null){
	user.getName();
}
```

User user = new User包括了以下三种语义：
1：分配对象的内存空间
2：初始化对象
3：将user指针指向刚分配的内存地址

操作2依赖于操作1，但是操作3并不依赖于操作2，所以JVM是可以针对它们进行指令的优化重排序的，优化后变为 1->3->2，这些线程1在执行完第3步而还没来得及执行完第2步的时候，如果内存刷新到了主存，那么线程2将得到一个未初始化完成的对象。

```java
//在线程A中:
context = loadContext();
inited = true;

//在线程B中:
while(!inited ){ //根据线程A中对inited变量的修改决定是否使用context变量
    sleep(100);
}
doSomethingwithconfig(context);
  
//假设线程A中发生了指令重排序:
inited = true;
context = loadContext();
//那么B中很可能就会拿到一个尚未初始化或尚未初始化完成的context,从而引发程序错误。
```



### 代码解读可见性

jdk1.5之后只要有一个变量是volatile修饰的，线程去主内存读取变量的时候会把所有的变量都重新加载到线程内存，写的时候也会将所有的变量写回主内存。

```java
public class Task implements Runnable{
  //将count用volatile修饰，保证每次去主存读取count值，
  //读取的同时会将running也从主存读取，不管running是否用volatile修饰
  private volatile int count = 0;
  private boolean running = true;

  @Override
  public void run() {
    while(running){
      //
      count++;
    }
    System.out.println("子线程"+Thread.currentThread().getName()+"停止");
  }

  public static void main(String[] args) throws InterruptedException {
    Task task = new Task();
    //启动子线程
    new Thread(task).start();
    Thread.currentThread().sleep(3000);
    task.setRunning(false);
    System.out.println("主线程停止");
  }

  public void setRunning(boolean running) {
    this.running = running;
  }

  public int getCount() {
    return count;
  }
}
```

如果不使用volatile修饰共享变量，线程只会在第一次使用共享变量的时候去主内存加载建立副本，这样子线程永远不会停止

使用volatile修饰修饰共享变量，在while循环的判断running值的时候，每次都去主内存获取最新的值，当主线程将running设置为false的时候，停止子线程，在while循环中使用了count变量，如果只将count用volatile修饰，也能停止子线程，由此可见，**线程去主内存读取共享变量的时候，会把所有用到的共享变量都在工作内存建立副本**

### 代码解读无法实现原子性

```java
public class Counter {
  //使用volatile修饰共享变量
  public volatile static int count = 0;

  public static void inc() {
    // 这里延迟1毫秒，使得结果明显
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
    }
    //无法保证是1000
    count++;
  }

  public static void main(String[] args) {

    // 同时启动1000个线程，去进行i++计算
    for (int i = 0; i < 1000; i++) {
      new Thread(new Runnable() {
        @Override
        public void run() {
          Counter.inc();
        }
      }).start();
    }
    // 无法保证count值为1000
    System.out.println("运行结果:Counter.count=" + Counter.count);
  }
}
```
这段程序执行完毕后无法保证count的数量最终为1000，这是因为volatile只能保证使用count的时候去主内存读取到最新的值，但是在对count进行+1操作的时候，其它线程可能会对count进行修改+1然后写会主内存，造成最后的结果不是1000，如果要保证1000，还是要对整个read到write回主内存保证一致性，这就需要使用synchronized或者lock去实现了。

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E5%B9%B6%E5%8F%91/ts5.jpg?raw=true)



## 原理和实现机制

lock前缀指令实际上相当于一个内存屏障（也成内存栅栏），内存屏障会提供3个功能：

1. 确保指令重排序时不会把其后面的指令排到内存屏障之前的位置，也不会把前面的指令排到内存屏障的后面；即在执行到内存屏障这句指令时，在它前面的操作已经全部完成；
2. 它会强制将对缓存的修改操作立即写入主存；
3. 如果是写操作，它会导致其他CPU中对应的缓存行无效。

### volatile的两点内存语义能保证可见性和有序性，但是能保证原子性吗？

首先我回答是不能保证原子性，要是说能保证，也只是对单个volatile变量的读/写具有原子性，但是对于类似volatile++这样的复合操作就无能为力了，比如下面的例子：

```java
public class Test {
    public volatile int inc = 0;

    public void increase() {
        inc++;
    }

    public static void main(String[] args) {
        final Test test = new Test();
        for(int i=0;i<10;i++){
            new Thread(){
                public void run() {
                    for(int j=0;j<1000;j++)
                        test.increase();
                };
            }.start();
        }

        while(Thread.activeCount()>1)  //保证前面的线程都执行完
            Thread.yield();
        System.out.println(test.inc);
    }
}
```

按道理来说结果是10000，但是运行下很可能是个小于10000的值。有人可能会说volatile不是保证了可见性啊，一个线程对inc的修改，另外一个线程应该立刻看到啊！可是这里的操作inc++是个复合操作啊，包括读取inc的值，对其自增，然后再写回主存。

假设线程A，读取了inc的值为10，这时候被阻塞了，因为没有对变量进行修改，触发不了volatile规则。

线程B此时也读inc的值，主存里inc的值依旧为10，做自增，然后立刻就被写回主存了，为11。

此时又轮到线程A执行，由于工作内存里保存的是10，所以继续做自增，再写回主存，11又被写了一遍。所以虽然两个线程执行了两次increase()，结果却只加了一次。

**有人说，volatile不是会使缓存行无效的吗？但是这里线程A读取到线程B也进行操作之前，并没有修改inc值，所以线程B读取的时候，还是读的10。**

**又有人说，线程B将11写回主存，不会把线程A的缓存行设为无效吗？但是线程A的读取操作已经做过了啊，只有在做读取操作时，发现自己缓存行无效，才会去读主存的值，所以这里线程A只能继续做自增了。**

## 总结

- volatile无法实现原子性，只能实现可见性
  1. 只有一个线程写共享变量，其他线程读共享变量的情况下使用volatile
  2. 多个线程同时对共享变量进行写操作的时候，无法保证原子性
- 当要访问的变量已在synchronized代码块中，或者为常量时，没必要使用volatile。
- 使用volatile每次都要去操作主内存，屏蔽掉了JVM中必要的代码优化，所以在**效率上比较低**
- **当且仅当满足以下所有条件时，才应该使用volatile变量：**
  1. 只有一个线程写共享变量，其他线程读共享变量
  2. 对变量的写入操作不依赖变量的当前值 （x++）
  3. 该变量没有包含在具有其他变量的不变式中（y=x）
  4. 防止代码重排

## 参考资料

[聊聊并发（一）深入分析Volatile的实现原理](http://ifeve.com/volatile/)

[Java并发：volatile内存可见性和指令重排](http://www.importnew.com/23535.html)

[Java Volatile Keyword](http://tutorials.jenkov.com/java-concurrency/volatile.html)

