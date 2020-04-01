---
title: hbase读写操作
date: 2017-09-08 22:23:32
tags:
- hbase
categories:
- 大数据
---

# hbase的增删改查

## hbase写操作

### 客户端流程解析

1. 用户提交put请求后，HBase客户端会将put请求添加到本地buffer中，符合一定条件就会通过AsyncProcess异步批量提交。HBase默认设置autoflush=true，表示put请求直接会提交给服务器进行处理；用户可以设置autoflush=false，这样的话put请求会首先放到本地buffer，等到本地buffer大小超过一定阈值（默认为2M，可以通过配置文件配置）之后才会提交。很显然，后者采用group commit机制提交请求，可以极大地提升写入性能，但是因为没有保护机制，如果客户端崩溃的话会导致提交的请求丢失。
2. 在提交之前，HBase根据rowkey找到它们归属的RegionServer，这个定位的过程是通过HConnection的locateRegion方法获得的。如果是批量请求的话还会把这些rowkey按照HRegionLocation分组，**每个分组可以对应一次RPC请求**。
3. HBase会为每个HRegionLocation构造一个远程RPC请求MultiServerCallable<Row>，然后通过rpcCallerFactory.<MultiResponse> newCaller()执行调用，忽略掉失败重新提交和错误处理，客户端的提交操作到此结束。

### 服务器端流程解析

服务器端RegionServer接收到客户端的写入请求后，首先会反序列化为Put对象，然后执行各种检查操作，比如检查region是否是只读、memstore大小是否超过blockingMemstoreSize等。检查完成之后，一次写事务保证了数据写入memstore和WAL中才结束，然后对读操作可见。

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hbase1.jpg?raw=true)

1. 获取行锁、Region更新共享锁： HBase中使用行锁保证对同一行数据的更新都是互斥操作，用以保证更新的原子性，要么更新成功，要么失败。

2. 开始写事务：获取write number，用于实现MVCC，实现数据的非锁定读，在保证读写一致性的前提下提高读取性能。

3. 写缓存memstore：HBase中每列族都会对应一个store，用来存储该列数据。每个store都会有个写缓存memstore，用于缓存写入数据。HBase并不会直接将数据落盘，而是先按rowKey排序写入缓存，等缓存满足一定大小之后再一起落盘。

4. Append HLog：HBase使用WAL机制保证数据可靠性，即使发生宕机，也可以通过恢复HLog还原出原始数据。该步骤就是将数据构造为WALEdit对象，然后顺序写入HLog中，此时不需要执行sync操作。

5. 释放行锁以及共享锁

6. Sync HLog：HLog真正sync到HDFS，在释放行锁之后执行sync操作是为了尽量减少持锁时间，提升写性能。如果Sync失败，执行回滚操作将memstore中已经写入的数据移除。

7. 结束写事务：此时该线程的更新操作才会对其他读请求可见，更新才实际生效。

8. flush memstore：当写缓存满64M之后，会启动flush线程将数据刷新到硬盘。新创建一个memStore接受请求，异步将旧的memStore刷写成一个StoreFile存储磁盘。

**先写memstore后写日志**

   1. 将写内存（memstore）放在lock保护的临界区内是为了保证写的内存可见性。因为存在多线程写，如果写内存放到临界区外（WAL的默认顺序：先刷日志再写内存），即使本线程已经完成sync wal，并推进了全局读取点(使新数据可被读取到)，但是仍然不能够保证写入memstore的数据版本对其他线程可见，所以这才将写内存这个操作提前到lock保护的临界区内
   2. sync WAL太耗时，所以把它放到临界区外，由递增的write num来保证WAL写的顺序性。这一点同样是通过lock来保证write num在内存中的可见性，因为write num在释放行锁之前创建，由java内存模型的Happens-Before来保证这一点。

### hbase删操作

Delete命令并不立即删除内容。实际上，它只是给记录打上删除的标记“墓碑”(tombstone)。墓碑记录不能在Get和Scan命令中返回结果。因为HFile是只读文件，这些墓碑记录直到执行一次大合并(major compaction)才会被删除。

## hbase读操作

RegionServer接收到客户端的get/scan请求之后，先后做了两件事情：构建scanner体系,　scanner体系的核心在于三层scanner：RegionScanner、StoreScanner以及StoreFileScanner。三者是层级的关系，一个RegionScanner由多个StoreScanner,构成，一张表由多个列族组成，就有多少个StoreScanner负责该列族的数据扫描。一个StoreScanner又是由多个StoreFileScanner组成。每个Store的数据由内存中的MemStore和磁盘上的StoreFile文件组成，相对应的，StoreScanner对象会雇佣一个MemStoreScanner和N个StoreFileScanner来进行实际的数据读取，每个StoreFile文件对应一个StoreFileScanner，注意：StoreFileScanner和MemstoreScanner是整个scan的最终执行者。

RegionScanner会根据列族构建StoreScanner，有多少列族就构建多少StoreScanner，用于负责该列族的数据检索
　　1.1 构建StoreFileScanner：每个StoreScanner会为当前该Store中每个HFile构造一个StoreFileScanner，用于实际执行对应文件的检索。同时会为对应Memstore构造一个MemstoreScanner，用于执行该Store中Memstore的数据检索

1.2 过滤淘汰StoreFileScanner：根据Time Range以及RowKey Range对StoreFileScanner以及MemstoreScanner进行过滤，淘汰肯定不存在待检索结果的Scanner。

1.3 Seek rowkey：所有StoreFileScanner开始做准备工作，在负责的HFile中定位到满足条件的起始Row。定位Block Offset：在Blockcache中读取该HFile的索引树结构，根据索引树检索对应RowKey所在的Block Offset和Block Size,Load Block：根据BlockOffset首先在BlockCache中查找Data Block，如果不在缓存，再在HFile中加载
,Seek Key：在Data Block内部通过二分查找的方式定位具体的RowKey

1.4 StoreFileScanner合并构建最小堆：将该Store中所有StoreFileScanner和MemstoreScanner合并形成一个heap(最小堆)，所谓heap是一个优先级队列，队列中元素是所有scanner，排序规则按照scanner seek到的keyvalue大小由小到大进行排序。

HBase中KeyValue是什么样的结构?
　　HBase中KeyValue并不是简单的KV数据对，而是一个具有复杂元素的结构体，其中Key由RowKey，ColumnFamily，Qualifier ，TimeStamp，KeyType等多部分组成，Value是一个简单的二进制数据。Key中元素KeyType表示该KeyValue的类型，取值分别为Put/Delete/Delete Column/Delete Family四种。

HBase中更新删除操作并不直接操作原数据，而是生成一个新纪录，那问题来了，如何知道一条记录到底是插入操作还是更新操作亦或是删除操作呢?这正是KeyType和Timestamp的用武之地。上文中提到KeyType取值为分别为Put/Delete/Delete Column/Delete Family四种，如果KeyType取值为Put，表示该条记录为插入或者更新操作，而无论是插入或者更新，都可以使用版本号(Timestamp)对记录进行选择;如果KeyType为Delete，表示该条记录为整行删除操作;相应的KeyType为Delete Column和Delete Family分别表示删除某行某列以及某行某列族操作;

上文提到KeyValue中Key由RowKey，ColumnFamily，Qualifier ，TimeStamp，KeyType等5部分组成，HBase设定Key大小首先比较RowKey，RowKey越小Key就越小;RowKey如果相同就看CF，CF越小Key越小;CF如果相同看Qualifier，Qualifier越小Key越小;Qualifier如果相同再看Timestamp，Timestamp越大表示时间越新，对应的Key越小。如果Timestamp还相同，就看KeyType，KeyType按照DeleteFamily -> DeleteColumn -> Delete -> Put 顺序依次对应的Key越来越大。



HBase中有两张特殊的Table，-ROOT-和.META.

.META.：记录了用户表的Region信息，.META.可以有多个regoin，以及RegionServer的服务器地址。

-ROOT-：记录了.META.表的Region信息，-ROOT-只有一个region

&Oslash; Zookeeper中记录了-ROOT-表的location

Client访问用户数据之前需要首先访问zookeeper，然后访问-ROOT-表，接着访问.META.表，最后才能找到用户数据的位置去访问，中间需要多次网络操作，不过client端会做cache缓存。

​    1、Client会通过内部缓存的相关的-ROOT-中的信息和.META.中的信息直接连接与请求数据匹配的HRegion server； 
​    2、然后直接定位到该服务器上与客户请求对应的region，客户请求首先会查询该region在内存中的缓存——memstore(memstore是是一个按key排序的树形结构的缓冲区)； 
​    3、如果在memstore中查到结果则直接将结果返回给client； 
​    4、在memstore中没有查到匹配的数据，接下来会读已持久化的storefile文件中的数据。storefile也是按key排序的树形结构的文件——并且是特别为范围查询或block查询优化过的，；另外hbase读取磁盘文件是按其基本I/O单元(即 hbase block)读数据的。具体就是过程就是： 
​    如果在BlockCache中能查到要造的数据则这届返回结果，否则就读去相应的storefile文件中读取一block的数据，如果还没有读到要查的数据，就将该数据block放到HRegion Server的blockcache中，然后接着读下一block块儿的数据，一直到这样循环的block数据直到找到要请求的数据并返回结果；如果将该region中的数据都没有查到要找的数据，最后接直接返回null，表示没有找的匹配的数据。当然blockcache会在其大小大于一的阀值（heapsize * hfile.block.cache.size * 0.85）后启动基于LRU算法的淘汰机制，将最老最不常用的block删除。

**2.1 多HTable并发写**

创建多个HTable客户端用于写操作，提高写数据的吞吐量，一个例子：

**2.2 HTable参数设置**

**2.2.1 Auto Flush**

通过调用HTable.setAutoFlush(false)方法可以将HTable写客户端的自动flush关闭，这样可以批量写入数据到 HBase，而不是有一条put就执行一次更新，只有当put填满客户端写缓存时，才实际向HBase服务端发起写请求。默认情况下auto flush是开启的。保证最后手动HTable.flushCommits()或HTable.close()。

**2.2.2 Write Buffer**

通过调用HTable.setWriteBufferSize(writeBufferSize)方法可以设置 HTable客户端的写buffer大小，如果新设置的buffer小于当前写buffer中的数据时，buffer将会被flush到服务端。其 中，writeBufferSize的单位是byte字节数，可以根据实际写入数据量的多少来设置该值。

**2.2.3 WAL Flag**

在HBae中，客户端向集群中的RegionServer提交数据时（Put/Delete操作），首先会先写WAL（Write Ahead Log）日志（即HLog，一个RegionServer上的所有Region共享一个HLog），只有当WAL日志写成功后，再接着写 MemStore，然后客户端被通知提交数据成功；如果写WAL日志失败，客户端则被通知提交失败。这样做的好处是可以做到RegionServer宕机 后的数据恢复。

因此，对于相对不太重要的数据，可以在Put/Delete操作时，通过调用Put.setWriteToWAL(false)或Delete.setWriteToWAL(false)函数，放弃写WAL日志，从而提高数据写入的性能。

值得注意的是：谨慎选择关闭WAL日志，因为这样的话，一旦RegionServer宕机，Put/Delete的数据将会无法根据WAL日志进行恢复。

**2.3 批量写**

通过调用HTable.put(Put)方法可以将一个指定的row key记录写入HBase，同样HBase提供了另一个方法：通过调用HTable.put(List<Put>)方法可以将指定的row key列表，批量写入多行记录，这样做的好处是批量执行，只需要一次网络I/O开销，这对于对数据实时性要求高，网络传输RTT高的情景下可能带来明显的性能提升。

**2.4 多线程并发写**

在客户端开启多个HTable写线程，每个写线程负责一个HTable对象的flush操作，这样结合定时flush和写 buffer（writeBufferSize），可以既保证在数据量小的时候，数据可以在较短时间内被flush（如1秒内），同时又保证在数据量大的 时候，写buffer一满就及时进行flush。下面给个具体的例子：

## 3、读表操作

**3.1 多HTable并发读**

创建多个HTable客户端用于读操作，提高读数据的吞吐量，一个例子：

**3.2 HTable参数设置**

**3.2.1 Scanner Caching**

hbase.client.scanner.caching配置项可以设置HBase scanner一次从服务端抓取的数据条数，默认情况下一次一条。通过将其设置成一个合理的值，可以减少scan过程中next()的时间开销，代价是 scanner需要通过客户端的内存来维持这些被cache的行记录。

有三个地方可以进行配置：1）在HBase的conf配置文件中进行配置；2）通过调用HTable.setScannerCaching(int scannerCaching)进行配置；3）通过调用Scan.setCaching(int caching)进行配置。三者的优先级越来越高。

**3.2.2 Scan AttributeSelection**

scan时指定需要的Column Family，可以减少网络传输数据量，否则默认scan操作会返回整行所有Column Family的数据。

**3.2.3 Close ResultScanner**

通过scan取完数据后，记得要关闭ResultScanner，否则RegionServer可能会出现问题（对应的Server资源无法释放）。

**3.3 批量读**

通过调用HTable.get(Get)方法可以根据一个指定的row key获取一行记录，同样HBase提供了另一个方法：通过调用HTable.get(List<Get>)方法可以根据一个指定的rowkey列表，批量获取多行记录，这样做的好处是批量执行，只需要一次网络I/O开销，这对于对数据实时性要求高而且网络传输RTT高的情景下可能带来明显 的性能提升。

**3.4 多线程并发读**

在客户端开启多个HTable读线程，每个读线程负责通过HTable对象进行get操作。下面是一个多线程并发读取HBase，获取店铺一天内各分钟PV值的例子：

**3.5 缓存查询结果**

对于频繁查询HBase的应用场景，可以考虑在应用程序中做缓存，当有新的查询请求时，首先在缓存中查找，如果存在则直接返回，不再查询HBase；否则对HBase发起读请求查询，然后在应用程序中将查询结果缓存起来。至于缓存的替换策略，可以考虑LRU等常用的策略。

**3.6 Blockcache**

HBase上Regionserver的内存分为两个部分，一部分作为Memstore，主要用来写；另外一部分作为BlockCache，主要用于读。写请求会先写入Memstore，Regionserver会给每个region提供一个Memstore，当Memstore满64MB以后，会创建一个新的MemStore，并将旧的MemStore flush刷新到磁盘。当Memstore的总大小超过限制时（heapsize * hbase.regionserver.global.memstore.upperLimit * 0.9），会强行启动flush进程，从最大的Memstore开始flush直到低于限制。读请求先到Memstore中查数据，查不到就到BlockCache中查，再查不到就会到磁盘上读，并把读的结果放入BlockCache。由于 BlockCache采用的是LRU策略，因此BlockCache达到上限(heapsize *hfile.block.cache.size * 0.85)后，会启动淘汰机制，淘汰掉最老的一批数据。一个Regionserver上有一个BlockCache和N个Memstore，它们的大小之和不能大于等于heapsize * 0.8，否则HBase不能启动。默认BlockCache为0.2，而Memstore为0.4。对于注重读响应时间的系统，可以将 BlockCache设大些，比如设置BlockCache=0.4，Memstore=0.39，以加大缓存的命中率。