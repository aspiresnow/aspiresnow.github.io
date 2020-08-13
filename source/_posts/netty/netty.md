---
title: netty
date: 2018-05-15 23:12:12
tags:
- netty
categories:
- java基础
---

# Netty

netty是高性能网络编程技术

<!--more-->

Netty 的主要构件块: 

- Channel：它代表一个到实体(如一个硬件设备、一个文件、一个网络套接字或者一个能够执行一个或者多个不同的I/O操作的程序组件)的开放连接，如读操作和写操作 。 目前，可以把 Channel 看作是传入(入站)或者传出(出站)数据的载体。因此，它可以被打开或者被关闭，连接或者断开连接。

- 回调：被通知回调的方法。Netty 在内部使用了回调来处理事件;当一个回调被触发时，相关的事件可以被一个 interface-ChannelHandler 的实现处理

- Future：Future 提供了另一种在操作完成时通知应用程序的方式，它将在未来的某个时刻完成，并提供对其结果的访问。每个 Netty 的出站 I/O 操作都将返回一个 ChannelFuture;也就是说，它们都不会阻塞。netty中的大部分方法都是异步的，返回值都是通过回调通知的，如connect方法不会阻塞，它将会注册一个ChannelFutureListener

  ```java
  ChannelFuture future = channel.connect(
  new InetSocketAddress("192.168.0.1", 25)); future.addListener(new ChannelFutureListener() {
  @Override
  public void operationComplete(ChannelFuture future) {
  if (future.isSuccess()){
  ByteBuf buffer = Unpooled.copiedBuffer(
  "Hello",Charset.defaultCharset()); ChannelFuture wf = future.channel() .....writeAndFlush(buffer);
  } else {
  Throwable cause = future.cause();
                cause.printStackTrace();
            }
  }); 	
  ```

- 事件:Netty 使用不同的事件来通知我们状态的改变或者是操作的状态

  - 连接已被激活或者连接失活
  - 数据读取
  - 用户事件
  - 错误事件
  - 打开或关闭到远程的连接
  - 将数据写到或冲刷到套接字

- ChannelHandler：负责接收和响应事件通知

  - 针对不同类型的事件来调用 ChannelHandler;
  - 将数据从一种格式转换为另一种格式
  - 提供异常的通知
  - 提供channel变为活动或非活动的通知
  - 提供channel注册到eventLoop或从eventLoop注销时的通知
  - 应用程序通过实现或者扩展 ChannelHandler 来挂钩到事件的生命周期，并且提供自定义的应用程序逻辑;

  ChannelHandler的生命周期方法

  - handlerAdded：handler添加到channelPipeline中调用
  - handlerRemoved：从channelPipeline中移除handler时调用
  - exceptionCaught：在channelPipeline有异常产生时调用

在内部，将会为每个 Channel 分配一个 EventLoop，用以处理所有事件，包括:

- 注册感兴趣的事件;
- 将事件派发给 ChannelHandler;
- 安排进一步的动作。
EventLoop 本身只由一个线程驱动，其处理了一个 Channel 的所有 I/O 事件，并且在该EventLoop 的整个生命周期内都不会改变。



@Sharable :在channalHandler上添加该注解标识该handler可以安全的被多个channel共享

如果服务器发送了 5 字节，那么不能保证这 5 字节会被一次性接收。即使是对于这么少量的数据，channelRead0()方法也可能会被调用两次，第一次使用一个持有 3 字节的 ByteBuf(Netty 的字节容器)，第二次使用一个持有 2 字节的 ByteBuf。作为一个面向流的协议，TCP 保证了字节数组将会按照服务器发送它们的顺序被接收。


exec-maven-plugin
​		
- Channel— Socket; 

  基本的 I/O 操作(bind()、connect()、read()和 write())依赖于底层网络传输所提供的原语。在基于 Java 的网络编程中，其基本的构造是 class Socket。 

  每个channel都会分配一个channelPileline和channelConfig

  可以通过channel获取分配给channel的eventLoop、channelPileLine、channelConfig、localAddress

  可以通过channel的write和fush方法实现写I/O

  Netty 的 Channel 实现是线程安全的，因此你可以存储一个到 Channel 的引用，并且每当
  你需要向远程节点写数据时，都可以使用它，即使当时许多线程都在使用它。

  channel分四个状态，

  - ChannelUnregistered ：channel已被创建，但未注册到EventLoop上

  - ChannelRegistered ：channel已被注册到EventLoop上

  - ChannelActive ：channel已经连接到远程节点，可以发送和接收数据

  - ChannelInActive：channel没有连接到远程节点

    
    channel在声明周期的每次状态变化都会有事件通知到ChannelPipeline链中的每个ChannelHandler

    在多个ChannelPipeline中安装同一个ChannelHandler的一个常见的原因是用于收集跨越多个 Channel 的统计信息。



- EventLoop— 控制流、多线程处理、并发;

  - 一个 EventLoopGroup 包含一个或者多个 EventLoop;  
  - 一个 EventLoop 在它的生命周期内只和一个 Thread 绑定;  即EventLoop和Thread的关系是一对一
  - 所有由 EventLoop 处理的 I/O 事件都将在它专有的 Thread 上被处理;  
  - 一个 Channel 在它的生命周期内只注册于一个 EventLoop;  
  - 一个 EventLoop 可能会被分配给一个或多个 Channel。 即EventLoop和channel的关系是一对多

- ChannelFuture— 异步通知。 

  Netty 中所有的 I/O 操作都是异步的。因为一个操作可能不会 立即返回，所以我们需要一种用于在之后的某个时间点确定其结果的方法。为此，Netty 提供了 ChannelFuture接口，其addListener()方法注册了一个ChannelFutureListener，以 便在某个操作完成时(无论是否成功)得到通知。 

  所有属于同一个 Channel 的操作都被保证其将以它们被调用的顺序被执行。 

- ChannelPipeline 

  ChannelPipeline 提供了 ChannelHandler 链的容器，并定义了用于在该链上传播入站 和出站事件流的 API。每一个新创建的Channel都会自动地分配一个新的 ChannelPipeline。

  - 一个ChannelInitializer的实现被注册到了ServerBootstrap中 1;
  - 当 ChannelInitializer.initChannel()方法被调用时，ChannelInitializer 将在 ChannelPipeline 中安装一组自定义的 ChannelHandler; 
  - ChannelInitializer 将它自己从 ChannelPipeline 中移除。 

  这些对象接收事件、执行它们所实现的处理逻辑，并将数据传递给ChannelHandler链中的下一个 ChannelHandler。它们的执行顺序是由它们被添加的顺序所决定的。实际上ChannelPipeline 就是给这些 ChannelHandler编排顺序的。

  数据的出站运动(即正在被写的数据)在概念上也是一样的。在这种情况下，数据将从 ChannelOutboundHandler 链的尾端开始流动，直到它到达链的头部为止。在这之后，出站 数据将会到达网络传输层，这里显示为 Socket。通常情况下，这将触发一个写操作。 

  数据的入站运动那么它会从 ChannelPipeline 的头部开始流动，并被传递给第一个 ChannelInboundHandler。这个 ChannelHandler 不一定 会实际地修改数据，具体取决于它的具体功能，在这之后，数据将会被传递给链中的下一个 ChannelInboundHandler。最终，数据将会到达 ChannelPipeline 的尾端，届时，所有 处理就都结束了。  

  当 ChannelHandler 被添加到 ChannelPipeline 时，它将会被分配一个 ChannelHandler- Context，其代表了 ChannelHandler 和 ChannelPipeline 之间的绑定。虽然这个对象可 以被用于获取底层的 Channel，但是它主要还是被用于写出站数据。 

  在Netty中，有两种发送消息的方式。你可以直接写到Channel中，也可以 写到和Channel- Handler 相关联的 ChannelHandlerContext 对象中。前一种方式将会导致消息从 Channel- Pipeline 的尾端开始流动，而后者将导致消息从 ChannelPipeline 中的下一个 Channel- Handler 开始流动。 

  通常 ChannelPipeline 中的每一个 ChannelHandler 都是通过它的 EventLoop(I/O 线程)来处理传递给它的事件的。所以至关重要的是不要阻塞这个线程，因为这会对整体的 I/O 处理产生负面的影响

   ChannelHandler.exceptionCaught()的默认实现是简单地将当前异常转发给ChannelPipeline 中的下一个 ChannelHandler; 如果异常到达了 ChannelPipeline 的尾端，它将会被记录为未被处理; 要想定义自定义的处理逻辑，你需要重写 exceptionCaught()方法。然后你需要决定是否需要将该异常传播出去。

- ChannelConfig

  ChannelConfig 包含了该 Channel 的所有配置设置，并且支持热更新。由于特定的传输可能
  具有独特的设置，所以它可能会实现一个 ChannelConfig 的子类型(

- ChannelHandlerContext

  ChannelHandlerContext使得ChannelHandler能够和它的ChannelPipeline以及其他的ChannelHandler 交 互 。 ChannelHandler 可 以 通 知 其 所 属 的 ChannelPipeline 中 的 下 一 个ChannelHandler，甚至可以动态修改它所属的ChannelPipeline1。

  ChannelHandlerContext 具有丰富的用于处理事件和执行 I/O 操作的 API。

  如果调用 Channel 或者 ChannelPipeline 上的这些方法，它们将沿着整个 ChannelPipeline 进行传播。而调用位于 ChannelHandlerContext上的相同方法，则将从当前所关联的 ChannelHandler 开始，并且只会传播给位于该ChannelPipeline 中的下一个能够处理该事件的 ChannelHandler。


  ​			
  ​		
  ​	


选择器selector背后的基本概念是充当一个注册表，在那里你将可以请求在 Channel 的状态发生变化时得到通知。可能的状态变化有:

-  新的 Channel 已被接受并且就绪;
-  Channel 连接已经完成;
-  Channel 有已经就绪的可供读取的数据;
-  Channel 可用于写数据。

选择器运行在一个检查状态变化并对其做出相应响应的线程上，在应用程序对状态的改变做出响应之后，选择器将会被重置，并将重复这个过程。

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/netty1.jpg)  	

### 编码器和解码器

当你通过 Netty 发送或者接收一个消息的时候，就将会发生一次数据转换。入站消息会被解 码;也就是说，从字节转换为另一种格式，通常是一个 Java 对象。如果是出站消息，则会发生 相反方向的转换:它将从它的当前格式被编码为字节。这两种方向的转换的原因很简单:网络数 据总是一系列的字节。 

### 引导 

Netty 的引导类为应用程序的网络层配置提供了容器，这涉及将一个进程绑定到某个指定的 端口，或者将一个进程连接到另一个运行在某个指定主机的指定端口上的进程。 

- Bootstrap 

  连接到远程主机和端口 

  1个EventLoopGroup 

- ServerBootstrap

  绑定到一个本地端口 

  2个EventLoopGroup 

  ​	因为服务器需要两组不同的 Channel。第一组将只包含一个 ServerChannel，代表服务 器自身的已绑定到某个本地端口的正在监听的套接字。而第二组将包含所有已创建的用来处理传 入客户端连接(对于每个服务器已经接受的连接都有一个)的 Channel。 与 ServerChannel 相关联的 EventLoopGroup 将分配一个负责为传入连接请求创建 Channel 的 EventLoop。一旦连接被接受，第二个 EventLoopGroup 就会给它的 Channel 分配一个 EventLoop。

  

  
##ByteBuf、ByteBufHolder

网络传输中的数据都是字节，java提供了ByteBuffer用来存储字节，netty对ByteBuffer进行了优化，使用ByteBuf来存储，

#### ByteBuf netty的数据容器

-  它可以被用户自定义的缓冲区类型扩展


- 通过内置的复合缓冲区类型实现了透明的零拷贝
- 容量可以按需增长(类似于 JDK 的 StringBuilder);
- 在读和写这两种模式之间切换不需要调用 ByteBuffer 的 flip()方法;
- 读和写使用了不同的索引;
- 支持方法的链式调用;
- 支持引用计数;
- 支持池化。

ByteBuf 维护了两个不同的索引:一个用于读取，一个用于写入。两个索引都是从0开始，当你从 ByteBuf 读取时，
它的 readerIndex 将会被递增已经被读取的字节数。同样地，当你写入 ByteBuf 时，它的writerIndex 也会被递增。

如果指定的读取的readerIndex>writerIndex的时候，将会抛出一个越界异常

名称以 read 或者 write 开头的 ByteBuf 方法，将会推进其对应的索引，而名称以 set 或者 get 开头的操作则不会。

任何名称以 read 或者 skip 开头的操作都将检索或者跳过位于当前readerIndex 的数据，并且将它增加已读字节数。

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/netty2.jpg)			
可丢弃字节的分段包含了已经被读过的字节。通过调用 discardReadBytes()方法，可以丢弃它们并回收空间。这个分段的初始大小为 0，存储在 readerIndex 中，会随着 read 操作的执行而增加(get*操作不会移动 readerIndex)。

调用discardReadBytes()方法会回收已读取的空间，同时会将可读取字节向前copy移动，调用该方法一方面最大化可写空间，当也需要copy移动可读字节

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/netty3.jpg)			
​				
通过调用 markReaderIndex()、markWriterIndex()、resetWriterIndex()和 resetReaderIndex()来标记和重置 ByteBuf 的 readerIndex 和 writerIndex。

可以通过调用 clear()方法来将 readerIndex 和 writerIndex 都设置为 0。注意这并不会清除内存中的内容。只移动索引。调用 clear()比调用 discardReadBytes()轻量得多，因为它将只是重置索引而不会复制任何的内存

可以同 indexOf和buf.forEachByte(ByteBufProcessor.FIND_NUL) 进行查找

duplicat和slice、unmodifiableBuffer是对byteBuf的浅拷贝，对象内容还是一个，调用copy方法是深拷贝

hasArray()？？？？byteBuf的存储类型？？？	ByteBufHolder ？？？

ByteBuf 分配 		ByteBufAllocator？？？

可以通过 Channel(每个都可以有一个不同的 ByteBufAllocator 实例)或者绑定到
ChannelHandler 的 ChannelHandlerContext 获取一个到 ByteBufAllocator 的引用。	ByteBufAllocator allocator = channel.alloc();	从 Channel 获取一个到ByteBufAllocator 的引用

Netty提供了两种ByteBufAllocator的实现:PooledByteBufAllocator和Unpooled-
ByteBufAllocator。前者池化了ByteBuf的实例以提高性能并最大限度地减少内存碎片。此实
现 使 用 了 一 种 称 为 j e m a l l o c 2 的 已 被 大 量 现 代 操 作 系 统 所 采 用 的 高 效 方 法 来 分 配 内 存 。后 者 的 实 现 不池化ByteBuf实例，并且在每次它被调用时都会返回一个新的实例。虽然Netty默认 1 使用了PooledByteBufAllocator，但这可以很容易地通过ChannelConfig API或者在引导你的应用程序时指定一个不同的分配器来更改。

你未能获取一个到 ByteBufAllocator 的引用。对于这种情况，Netty 提供了一个简单的称为 Unpooled 的工具类，它提供了静态的辅助方法来创建未池化的 ByteBuf实例

ByteBufUtil.hexdump() 	 它以十六进制的表示形式打印 ByteBuf 的内容


ReferenceCountUtil.release(msg) ：丢弃已经接收到的消息

​			

根据配置和可用核心的不同，可能会创建多个 EventLoop 实例用以优化资源的使用，并且单个EventLoop 可能会被指派用于服务多个 Channel。

事件/任务的执行顺序 事件和任务是以先进先出(FIFO)的顺序执行的。这样可以通过保证字节内容总是按正确的顺序被处理，消除潜在的数据损坏的可能性。

每个 EventLoop 都有它自已的任务队列，独立于任何其他的 EventLoop

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/netty4.jpg)	
永远不要将一个长时间运行的任务放入到执行队列中，因为它将阻塞需要在同一线程上执行的任何其他任务。”如果必须要进行阻塞调用或者执行长时间运行的任务，我们建议使用一个专门的EventExecutor

​			
![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/netty5.jpg)		
异步传输实现只使用了少量的 EventLoop(以及和它们相关联的 Thread)，而且在当前的线程模型中，它们可能会被多个 Channel 所共享。这使得可以通过尽可能少量的 Thread 来支撑大量的 Channel，而不是每个 Channel 分配一个 Thread

EventLoopGroup 负责为每个新创建的 Channel 分配一个 EventLoop。在当前实现中，使用顺序循环(round-robin)的方式进行分配以获取一个均衡的分布，并且相同的 EventLoop可能会被分配给多个 Channel

一旦一个 Channel 被分配给一个 EventLoop，它将在它的整个生命周期中都使用这个EventLoop(以及相关联的 Thread)

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/netty6.jpg)			
​				
Bootstrap 类负责为客户端和使用无连接协议的应用程序创建 Channel	

```
<T> Bootstrap option(
    ChannelOption<T> option,
    T value)
设置 ChannelOption，其将被应用到每个新创建的Channel 的 ChannelConfig。这些选项将会通过bind()或者 connect()方法设置到 Channel，不管哪个先被调用。这个方法在 Channel 已经被创建后再调用将不会有任何的效果。支持的 ChannelOption 取决于使用的 Channel 类型。
```



