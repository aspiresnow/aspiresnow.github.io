---
title: hbase的memstore
date: 2017-09-15 00:00:56
tags:
- hbase
categories:
- 大数据
---

Memstore是HBase框架中非常重要的组成部分之一，是HBase能够实现高性能随机读写至关重要的一环。深入理解Memstore的工作原理、运行机制以及相关配置，对hbase集群管理、性能调优都有着非常重要的帮助。

**Memstore 概述**

HBase中，Region是集群节点上最小的数据服务单元，用户数据表由一个或多个Region组成。在Region中每个ColumnFamily的数据组成一个Store。每个Store由一个Memstore和多个HFile组成，如下图所示：

![image](https://blog-1257941127.cos.ap-beijing.myqcloud.com/uPic/4yaGX2.jpg)

之前我们提到，HBase是基于LSM-Tree模型的，所有的数据更新插入操作都首先写入Memstore中（同时会顺序写到日志HLog中），达到指定大小之后再将这些修改操作批量写入磁盘，生成一个新的HFile文件，这种设计可以极大地提升HBase的写入性能；另外，HBase为了方便按照RowKey进行检索，要求HFile中数据都按照RowKey进行排序，Memstore数据在flush为HFile之前会进行一次排序，将数据有序化；还有，根据局部性原理，新写入的数据会更大概率被读取，因此HBase在读取数据的时候首先检查请求的数据是否在Memstore，写缓存未命中的话再到读缓存中查找，读缓存还未命中才会到HFile文件中查找，最终返回merged的一个结果给用户。

可见，Memstore无论是对HBase的写入性能还是读取性能都至关重要。其中flush操作又是Memstore最核心的操作，接下来重点针对Memstore的flush操作进行深入地解析：首先分析HBase在哪些场景下会触发flush，然后结合源代码分析整个flush的操作流程，最后再重点整理总结和flush相关的配置参数，这些参数对于性能调优、问题定位都非常重要。

**Memstore Flush触发条件**

HBase会在如下几种情况下触发flush操作，**需要注意的是MemStore的最小flush单元是HRegion而不是单个MemStore**。可想而知，如果一个HRegion中Memstore过多，每次flush的开销必然会很大，因此我们也建议在进行表设计的时候尽量减少ColumnFamily的个数。

1. Memstore级别限制：当Region中任意一个MemStore的大小达到了上限（hbase.hregion.memstore.flush.size，默认128MB），会触发Memstore刷新。
2. Region级别限制：当Region中所有Memstore的大小总和达到了上限（hbase.hregion.memstore.block.multiplier * hbase.hregion.memstore.flush.size，默认 2* 128M = 256M），会触发memstore刷新。
3. Region Server级别限制：当一个Region Server中所有Memstore的大小总和达到了上限（hbase.regionserver.global.memstore.upperLimit ＊ hbase_heapsize，默认 40%的JVM内存使用量），会触发部分Memstore刷新。Flush顺序是按照Memstore由大到小执行，先Flush Memstore最大的Region，再执行次大的，直至总体Memstore内存使用量低于阈值（hbase.regionserver.global.memstore.lowerLimit ＊ hbase_heapsize，默认 38%的JVM内存使用量）。
4. 当一个Region Server中HLog数量达到上限（可通过参数hbase.regionserver.maxlogs配置）时，系统会选取最早的一个 HLog对应的一个或多个Region进行flush
5. HBase定期刷新Memstore：默认周期为1小时，确保Memstore不会长时间没有持久化。为避免所有的MemStore在同一时间都进行flush导致的问题，定期的flush操作有20000左右的随机延时。
6. 手动执行flush：用户可以通过shell命令 flush ‘tablename’或者flush ‘region name’分别对一个表或者一个Region进行flush。

**Memstore Flush流程**

为了减少flush过程对读写的影响，HBase采用了类似于两阶段提交的方式，将整个flush过程分为三个阶段：

1. prepare阶段：遍历当前Region中的所有Memstore，将Memstore中当前数据集kvset做一个快照snapshot，然后再新建一个新的kvset。后期的所有写入操作都会写入新的kvset中，而整个flush阶段读操作会首先分别遍历kvset和snapshot，如果查找不到再会到HFile中查找。prepare阶段需要加一把updateLock对写请求阻塞，结束之后会释放该锁。因为此阶段没有任何费时操作，因此持锁时间很短。
2. flush阶段：遍历所有Memstore，将prepare阶段生成的snapshot持久化为临时文件，临时文件会统一放到目录.tmp下。这个过程因为涉及到磁盘IO操作，因此相对比较耗时。
3. commit阶段：遍历所有的Memstore，将flush阶段生成的临时文件移到指定的ColumnFamily目录下，针对HFile生成对应的storefile和Reader，把storefile添加到HStore的storefiles列表中，最后再清空prepare阶段生成的snapshot。

上述flush流程可以通过日志信息查看：

```xml
/******* prepare阶段 ********/
2016-02-04 03:32:41,516 INFO  [MemStoreFlusher.1] regionserver.HRegion: Started memstore flush for sentry_sgroup1_data,{\xD4\x00\x00\x01|\x00\x00\x03\x82\x00\x00\x00?\x06\xDA`\x13\xCAE\xD3C\xA3:_1\xD6\x99:\x88\x7F\xAA_\xD6[L\xF0\x92\xA6\xFB^\xC7\xA4\xC7\xD7\x8Fv\xCAT\xD2\xAF,1452217805884.572ddf0e8cf0b11aee2273a95bd07879., current region memstore size 128.9 M

/******* flush阶段 ********/
2016-02-04 03:32:42,423 INFO  [MemStoreFlusher.1] regionserver.DefaultStoreFlusher: Flushed, sequenceid=1726212642, memsize=128.9 M, hasBloomFilter=true, into tmp file hdfs://hbase1/hbase/data/default/sentry_sgroup1_data/572ddf0e8cf0b11aee2273a95bd07879/.tmp/021a430940244993a9450dccdfdcb91d

/******* commit阶段 ********/
2016-02-04 03:32:42,464 INFO  [MemStoreFlusher.1] regionserver.HStore: Added hdfs://hbase1/hbase/data/default/sentry_sgroup1_data/572ddf0e8cf0b11aee2273a95bd07879/d/021a430940244993a9450dccdfdcb91d, entries=643656, sequenceid=1726212642, filesize=7.1 M
```

整个flush过程可能涉及到compact操作和split操作，因为过于复杂，在此暂时略过不表。

**Memstore Flush对业务读写的影响**

上文介绍了HBase在什么场景下会触发flush操作以及flush操作的基本流程，想必对于HBase用户来说，最关心的是flush行为会对读写请求造成哪些影响以及如何避免。因为不同触发方式下的flush操作对用户请求影响不尽相同，因此下面会根据flush的不同触发方式分别进行总结，并且会根据影响大小进行归类：

**影响甚微**

正常情况下，大部分Memstore Flush操作都不会对业务读写产生太大影响，比如这几种场景：HBase定期刷新Memstore、手动执行flush操作、触发Memstore级别限制、触发HLog数量限制以及触发Region级别限制等，这几种场景只会阻塞对应Region上的写请求，阻塞时间很短，毫秒级别。

**影响较大**

然而一旦触发Region Server级别限制导致flush，就会对用户请求产生较大的影响。会阻塞所有落在该Region Server上的更新操作，阻塞时间很长，甚至可以达到分钟级别。一般情况下Region Server级别限制很难触发，但在一些极端情况下也不排除有触发的可能，下面分析一种可能触发这种flush操作的场景：

相关JVM配置以及HBase配置：

```properties
maxHeap = 71
hbase.regionserver.global.memstore.upperLimit = 0.35
hbase.regionserver.global.memstore.lowerLimit = 0.30
```

基于上述配置，可以得到触发Region Server级别的总Memstore内存和为24.9G，如下所示：

```properties
2015-10-12 13:05:16,232 INFO  [regionserver60020] regionserver.MemStoreFlusher: globalMemStoreLimit=24.9 G, globalMemStoreLimitLowMark=21.3 G, maxHeap=71 G
```

假设每个Memstore大小为默认128M，在上述配置下如果每个Region有两个Memstore，整个Region Server上运行了100个region，根据计算可得总消耗内存 = 128M * 100 * 2 = 25.6G > 24.9G，很显然，这种情况下就会触发Region Server级别限制，对用户影响相当大。

根据上面的分析，导致触发Region Server级别限制的因素主要有一个Region Server上运行的Region总数，一个是Region上的Store数（即表的ColumnFamily数）。对于前者，根据读写请求量一般建议线上一个Region Server上运行的Region保持在50~80个左右，太小的话会浪费资源，太大的话有可能触发其他异常；对于后者，建议ColumnFamily越少越好，如果从逻辑上确实需要多个ColumnFamily，最好控制在3个以内。