---
title: hbase的表设计
date: 2017-09-10 21:36:01
tags:
- hbase
categories:
- 大数据
---

# hbase的表设计

[HBase Rowkey的散列与预分区设计](http://www.cnblogs.com/bdifn/p/3801737.html)

## RowKey设计原则

1）Rowkey长度原则，Rowkey是一个二进制码流，可以是任意字符串，最大长度64KB，实际应用中一般为10~100bytes，存为byte[]字节数组，一般设计成定长的。建议是越短越好，不要超过16个字节。原因一数据的持久化文件HFile中是按照KeyValue存储的，如果Rowkey过长比如100个字节，1000万列数据光Rowkey就要占用100*1000万=10亿个字节，将近1G数据，这会极大影响HFile的存储效率；原因二MemStore将缓存部分数据到内存，如果Rowkey字段过长内存的有效利用率会降低，系统将无法缓存更多的数据，这会降低检索效率。因此Rowkey的字节长度越短越好。原因三目前操作系统是都是64位系统，内存8字节对齐。控制在16个字节，8字节的整数倍利用操作系统的最佳特性。
2）是Rowkey散列原则，如果Rowkey是按时间戳的方式递增，不要将时间放在二进制码的前面，建议将Rowkey的高位作为散列字段，由程序循环生成，低位放时间字段，这样将提高数据均衡分布在每个Regionserver实现负载均衡的几率。如果没有散列字段，首字段直接是时间信息将产生所有新数据都在一个RegionServer上堆积的热点现象，这样在做数据检索的时候负载将会集中在个别RegionServer，降低查询效率。
3）Rowkey唯一原则，必须在设计上保证其唯一性。
row key是按照字典序存储，因此，设计row key时，要充分利用这个排序特点，将经常一起读取的数据存储到一块，将最近可能会被访问的数据放在一块。
举个例子：如果最近写入HBase表中的数据是最可能被访问的，可以考虑将时间戳作为row key的一部分，由于是字典序排序，所以可以使用Long.MAX_VALUE – timestamp作为row key，这样能保证新写入的数据在读取时可以被快速命中。

## 列族设计原则

同一Column Family的Columns会群聚在一个存储文件上，并依Column key排序，因此设计时：读写相关性较高的数据，存在同一列族中。

由于Hbase是一个面向列族的存储器，调优和存储都是在列族这个层次上进行的，最好使列族成员都有相同的"访问模式(access pattern)"和大小特征；
在一张表里不要定义太多的column family。目前Hbase并不能很好的处理超过2~3个column family的表。因为某个column family在flush的时候，它邻近的column family也会因关联效应被触发flush，最终导致系统产生更多的I/O。



在一张表里不要定义太多的column family。目前Hbase并不能很好的处理超过2~3个column family的表。因为某个column family在flush的时候，它邻近的column family也会因关联效应被触发flush，最终导致系统产生更多的I/O。

- family越多，那么获取每一个cell数据的优势越明显，因为io和网络都减少了，而如果只有一个family，那么每一次读都会读取当前rowkey的所有数据，网络和io上会有一些损失。
  ​    当然如果要获取的是固定的几列数据，那么把这几列写到一个family中比分别设置family要更好，因为只需一次请求就能拿回所有数据。

  首先，不同的family是在同一个region下面。而每一个family都会分配一个memstore，所以更多的family会消耗更多的内存。
  其次,目前版本的hbase，在flush和compaction都是以region为单位的，也就是说当一个family达到flush条件时，该region的所有family所属的memstore都会flush一次，即使memstore中只有很少的数据也会触发flush而生成小文件。这样就增加了compaction发生的机率，而compaction也是以region为单位的，这样就很容易发生compaction风暴从而降低系统的整体吞吐量。
  第三，由于hfile是以family为单位的，因此对于多个family来说，数据被分散到了更多的hfile中，减小了split发生的机率。这是把双刃剑。更少的split会导致该region的体积比较大，由于balance是以region的数目而不是大小为单位来进行的，因此可能会导致balance失效。而从好的方面来说，更少的split会让系统提供更加稳定的在线服务。

  上述第三点的好处对于在线应用来说是明显的，而坏处我们可以通过在请求的低谷时间进行人工的split和balance来避免掉。

## 表结构

```shell
create 'NewsClickFeedback',{NAME=>'Toutiao',VERSIONS=>1,BLOCKCACHE=>true,BLOOMFILTER=>'ROW',COMPRESSION=>'SNAPPY',TTL => ' 259200 '},{SPLITS => ['1','2','3','4','5','6','7','8','9','a','b','c','d','e','f']}
```

- versions 

  数据版本数，HBase数据模型允许一个cell的数据为带有不同时间戳的多版本数据集，versions参数指定了最多保存几个版本数据，默认为1。如果想保存两个历史版本数据，可以将versions参数设置为2

- 布隆过滤器BloomFilter

  布隆过滤器，优化HBase的**随机**读取性能，可选值NONE|ROW|ROWCOL，默认为NONE，该参数可以单独对某个列簇启用。启用过滤器，对于get操作以及部分scan操作可以剔除掉不会用到的存储文件，减少实际IO次数，提高随机读性能。Row类型适用于只根据Row进行查找，而RowCol类型适用于根据Row+Col联合查找，如下：

  Row类型适用于：get ‘NewsClickFeedback’,’row1′

  RowCol类型适用于：get ‘NewsClickFeedback’,’row1′,{COLUMN => ‘Toutiao’}

  对于有随机读的业务，建议开启Row类型的过滤器，使用空间换时间，提高随机读性能。

- compression 

  数据压缩方式，HBase支持多种形式的数据压缩，一方面减少数据存储空间，一方面降低数据网络传输量进而提升读取效率。目前HBase支持的压缩算法主要包括三种：GZip | LZO | Snappy

  Snappy的压缩率最低，但是编解码速率最高，对CPU的消耗也最小，目前一般建议使用Snappy

- 过期时间 TTL

  数据过期时间，单位为秒，默认为永久保存。如果设置了过期时间，HBase在Compact时会通过一定机制检查数据是否过期，过期数据会被删除。用户可以根据具体业务场景设置为一个月或者三个月。示例中TTL => ‘ 259200’设置数据过期时间为三天

- in_memory

  数据是否常驻内存，默认为false。HBase为频繁访问的数据提供了一个缓存区域，缓存区域一般存储数据量小、访问频繁的数据，常见场景为元数据存储。默认情况，该缓存区域大小等于Jvm Heapsize * 0.2 * 0.25 ，假如Jvm Heapsize = 70G，存储区域的大小约等于3.2G。需要注意的是HBase Meta元数据信息存储在这块区域，如果业务数据设置为true而且太大会导致Meta数据被置换出去，导致整个集群性能降低，所以在设置该参数时需要格外小心

- blockCache

  是否开启block cache缓存，默认开启。

- splits

  region预分配策略。通过region预分配，数据会被均衡到多台机器上，这样可以一定程度上解决热点应用数据量剧增导致系统自动split引起的性能问题