---
title: hbase的WAL详解
date: 2017-09-14 00:12:39
tags:
- hbase
categories:
- 大数据
---

# hbase的WAL详解

WAL(Write-Ahead Logging)是一种高效的日志算法，基本原理是在数据写入之前首先顺序写入日志，然后再写入缓存，等到缓存写满之后统一落盘。之所以能够提升写性能，是因为WAL将一次随机写转化为了一次顺序写加一次内存写。提升写性能的同时，WAL可以保证数据的可靠性，即在任何情况下数据不丢失。假如一次写入完成之后发生了宕机，即使所有缓存中的数据丢失，也可以通过恢复日志还原出丢失的数据。

<!--more-->

## WAL持久化等级

HBase中可以通过设置WAL的持久化等级决定是否开启WAL机制、以及HLog的落盘方式put.setDurability();持久化等级分为如下四个等级：

1. SKIP_WAL：只写缓存，不写HLog日志。这种方式因为只写内存，因此可以极大的提升写入性能，但是数据有丢失的风险。在实际应用过程中并不建议设置此等级，除非确认不要求数据的可靠性。
2. ASYNC_WAL：异步将数据写入HLog日志中。
3. SYNC_WAL：同步将数据写入日志文件中，需要注意的是数据只是被写入文件系统中，并没有真正落盘。
4. FSYNC_WAL：同步将数据写入日志文件并强制落盘。最严格的日志写入等级，可以保证数据不会丢失，但是性能相对比较差。
5. USER_DEFAULT：默认如果用户没有指定持久化等级，HBase使用SYNC_WAL等级持久化数据。

## hbase中的WAL操作

- **每个Region Server维护一个Hlog，而不是每个Region一个**。这样不同Region(来自不同table)的日志会混在一起，这样做的目的是不断追加单个文件相对于同时写多个文件而言，可以减少磁盘寻道次数同时也可以减少日志文件，因此可以提高对table的写性能。带来的麻烦是，如果一台Region Server下线，为了恢复其上的Region，需要将Region Server上的log进行拆分，然后分发到其它Region Server上进行恢复
- 当HRS意外终止后，HMaster会通过ZK感知到，**HMaster根据HR的不同对HLog进行拆分Split，并分配给对应的HR。**领取到这些HLog的HRS在Load HRegion的过程中，发现有历史HLog需要处理，因此会“重做”Replay HLog中的数据到mem Store中，然后Flush到Store File，完成数据恢复
- HLog存放在HDFS上，会定期回滚产生新的
- WAL(预写日志)每次更新数据时，都会先将数据记录到提交日志中，然后才会将这些数据写入到内存中的memstore，但是写入达到阈值，会将memstore中数据持久化为HFIle文件刷写到磁盘，之后系统会丢弃对应的提交日志，只保留未持久化到磁盘的数据的提交日志。在系统将数据移出memstore写入磁盘的过程中可以不阻塞系统的读写，会使用一个新的memstore接收写入数据，将满的旧memstore转换成一个storeFile。memstore中的数据时按行键顺序排序的，持久化到磁盘上的时候也是按照这个顺序。

### HLog File

- HBase中WAL的存储格式{HLogKey,WALEdit}，物理上是Hadoop的Sequence File
- HLog文件就是一个普通的Hadoop Sequence File，Sequence File 的Key是HLogKey对象，HLogKey中记录了写入数据的归属信息，除了table和region名字外，同时还包括 sequence number和timestamp，timestamp是“写入时间”，sequence number的起始值为0，或者是最近一次存入文件系统中sequence number。
- HLog Sequece File的Value是HBase的KeyValue对象，即对应HFile中的KeyValue.
- ![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/fDAbXn.jpg)

region name和table name分别表征该段日志属于哪个region以及哪张表；cluster ids用于将日志复制到集群中其他机器上。

## 参考资料

[HBase － 数据写入流程解析](http://hbasefly.com/2016/03/23/hbase_writer/)