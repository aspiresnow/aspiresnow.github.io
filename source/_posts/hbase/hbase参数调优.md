---
title: hbase调优
date: 2017-09-09 14:42:10
tags:
- hbase
categories:
- 大数据
---

# Hbase调优

[[HBase优化相关](http://www.cnblogs.com/skyl/p/4814347.html)]



zookeeper.session.timeout
默认值：3分钟(180000ms)
说明：RegionServer与Zookeeper间的连接超时时间。当超时时间到后，ReigonServer会被Zookeeper从RS集群清单中移除，HMaster收到移除通知后，会对这台server负责的regions重新balance，让其他存活的RegionServer接管.
调优：这个timeout决定了RegionServer是否能够及时的failover。设置成1分钟或更低，可以减少因等待超时而被延长的failover时间。
不过需要注意的是，对于一些Online应用，RegionServer从宕机到恢复时间本身就很短的(网络闪断，crash等故障，运维可快速介入)，如果调低timeout时间，反而会得不偿失。因为当ReigonServer被正式从RS集群中移除时，HMaster就开始做balance了 (让其他RS根据故障机器记录的WAL日志进行恢复)。当故障的RS在人工介入恢复后，这个balance动作是毫无意义的，反而会使负载不均匀，给RS 带来更多负担。特别是那些固定分配regions的场景。

hbase.regionserver.handler.count
默认值：10
说明：RegionServer的请求处理IO线程数。
调优：这个参数的调优与内存息息相关。
较少的IO线程，适用于处理单次请求内存消耗较高的Big PUT场景(大容量单次PUT或设置了较大cache的scan，均属于Big PUT)或ReigonServer的内存比较紧张的场景。
较多的IO线程，适用于单次请求内存消耗低，TPS要求非常高的场景。设置该值的时候，以监控内存为主要参考。
这里需要注意的是如果server的region数量很少，大量的请求都落在一个region上，因快速充满memstore触发flush导致的读写锁会影响全局TPS，不是IO线程数越高越好。
压测时，开启Enabling RPC-level logging，可以同时监控每次请求的内存消耗和GC的状况，最后通过多次压测结果来合理调节IO线程数。

hbase.hregion.max.filesize
默认值：256M
说明：在当前ReigonServer上单个Reigon的最大存储空间，单个Region超过该值时，这个Region会被自动split成更小的region。
调优：小region对split和compaction友好，因为拆分region或compact小region里的storefile速度很快，内存占用低。缺点是split和compaction会很频繁。特别是数量较多的小region不停地split, compaction，会导致集群响应时间波动很大，region数量太多不仅给管理上带来麻烦，甚至会引发一些Hbase的bug。一般512以下的都算小region。
大region，则不太适合经常split和compaction，因为做一次compact和split会产生较长时间的停顿，对应用的读写性能冲击非常大。此外，大region意味着较大的storefile，compaction时对内存也是一个挑战。
当然，大region也有其用武之地。如果你的应用场景中，某个时间点的访问量较低，那么在此时做compact和split，既能顺利完成split和compaction，又能保证绝大多数时间平稳的读写性能。
内存方面，小region在设置memstore的大小值上比较灵活，大region则过大过小都不行，过大会导致flush时app的IO wait增高，过小则因store file过多影响读性能。

既然split和compaction如此影响性能，有没有办法去掉?
compaction是无法避免的，split倒是可以从自动调整为手动。
只要通过将这个参数值调大到某个很难达到的值，比如100G，就可以间接禁用自动split(RegionServer不会对未到达100G的region做split)。
再配合RegionSplitter这个工具，在需要split时，手动split。
手动split在灵活性和稳定性上比起自动split要高很多，相反，管理成本增加不多，比较推荐online实时系统使用。

hbase.regionserver.global.memstore.upperLimit/lowerLimit
默认值：0.4/0.35
upperlimit说明：hbase.hregion.memstore.flush.size 这个参数的作用是:当单个memstore达到指定值时，flush该memstore。但是，一台ReigonServer可能有成百上千个memstore，每个memstore也许未达到flush.size，jvm的heap就不够用了。该参数就是为了限制memstores占用的总内存。
当ReigonServer内所有的memstore所占用的内存总和达到heap的40%时，HBase会强制block所有的更新并flush这些memstore以释放所有memstore占用的内存。
lowerLimit说明：同upperLimit，只不过当全局memstore的内存达到35%时，它不会flush所有的memstore，它会找一些内存占用较大的memstore，做个别flush，当然更新还是会被block。lowerLimit算是一个在全局flush导致性能暴跌前的补救措施。为什么说是性能暴跌?可以想象一下，如果memstore需要在一段较长的时间内做全量flush，且这段时间内无法接受任何读写请求，对HBase集群的性能影响是很大的。
调优：这是一个Heap内存保护参数，默认值已经能适用大多数场景。它的调整一般是为了配合某些专属优化，比如读密集型应用，将读缓存开大，降低该值，腾出更多内存给其他模块使用。

这个参数会给使用者带来什么影响?
比如，10G内存，100个region，每个memstore 64M，假设每个region只有一个memstore，那么当100个memstore平均占用到50%左右时，就会达到lowerLimit的限制。假设此时，其他memstore同样有很多的写请求进来。在那些大的region未flush完，就可能又超过了upperlimit，则所有 region都会被block，开始触发全局flush。
不过，除了你的内存非常小或你的应用场景里大多数都是读，我觉得不需要去调这个参数。



hfile.block.cache.size
默认值：0.2
说明：storefile的读缓存占用Heap的大小百分比，0.2表示20%。该值直接影响数据读的性能。
调优：当然是越大越好，如果读比写多，开到0.4-0.5也没问题。如果读写较均衡，0.3左右。如果读比写少，果断默认吧。设置这个值的时候，你同时要参考 hbase.regionserver.global.memstore.upperLimit ，该值是memstore占heap的最大百分比，两个参数一个影响读，一个影响写。如果两值加起来超过80-90%，会有OOM的风险，谨慎设置。

hbase.hstore.blockingStoreFiles
默认值：7
说明：在compaction时，如果一个Store(Coulmn Family)内有超过7个storefile需要合并，则阻塞block所有的写请求，进行flush，限制storefile数量增长过快。
调优：block写请求会影响当前region的性能，将值设为单个region可以支撑的最大store file数量会是个不错的选择，即允许comapction时，memstore继续生成storefile。最大storefile数量可通过 region size/memstore size来计算。如果你将region size设为无限大，那么你需要预估一个region可能产生的最大storefile数。

hbase.hregion.memstore.block.multiplier
默认值：2
说明：当一个region里的memstore超过单个memstore.size两倍的大小时，block该region的所有请求，进行 flush，释放内存。虽然我们设置了memstore的总大小，比如64M，但想象一下，在最后63.9M的时候，我Put了一个100M的数据，此时 memstore的大小会瞬间暴涨到超过预期的memstore.size。这个参数的作用是当memstore的大小增至超过 memstore.size时，block所有请求，遏制风险进一步扩大。
调优：这个参数的默认值还是比较靠谱的。如果你预估你的正常应用场景(不包括异常)不会出现突发写或写的量可控，那么保持默认值即可。如果正常情况下，你的写请求量就会经常暴长到正常的几倍，那么你应该调大这个倍数并调整其他参数值，比如hfile.block.cache.size和 hbase.regionserver.global.memstore.upperLimit/lowerLimit，以预留更多内存，防止HBase server OOM。

启用LZO压缩
LZO对比Hbase默认的GZip，前者性能较高，后者压缩比较高，具体参见 Using LZO Compression 。对于想提高HBase读写性能的开发者，采用LZO是比较好的选择。对于非常在乎存储空间的开发者，则建议保持默认。

不要定义太多的Column Family
Hbase目前不能良好的处理超过包含2-3个CF的表。因为某个CF在flush发生时，它邻近的CF也会因关联效应被触发flush，最终导致系统产生更多IO。

批量导入
在批量导入数据到Hbase前，你可以通过预先创建regions，来平衡数据的负载。详见 Table Creation: Pre-Creating Regions

避免CMS concurrent mode failure
HBase使用CMS GC。默认触发GC的时机是当年老代内存达到90%的时候，这个百分比由 -XX:CMSInitiatingOccupancyFraction=N 这个参数来设置。concurrent mode failed发生在这样一个场景：
当年老代内存达到90%的时候，CMS开始进行并发垃圾收集，于此同时，新生代还在迅速不断地晋升对象到年老代。当年老代CMS还未完成并发标记时，年老代满了，悲剧就发生了。CMS因为没内存可用不得不暂停mark，并触发一次全jvm的stop the world(挂起所有线程)，然后采用单线程拷贝方式清理所有垃圾对象。这个过程会非常漫长。为了避免出现concurrent mode failed，我们应该让GC在未到90%时，就触发。
通过设置 -XX:CMSInitiatingOccupancyFraction=N
这个百分比， 可以简单的这么计算。如果你的 hfile.block.cache.size 和 hbase.regionserver.global.memstore.upperLimit 加起来有60%(默认)，那么你可以设置 70-80，一般高10%左右差不多。

Hbase客户端优化
AutoFlush(默认是true)
将HTable的setAutoFlush设为false，可以支持客户端批量更新。即当Put填满客户端flush缓存时，才发送到服务端。

Scan Caching
scanner一次缓存多少数据来scan(从服务端一次抓多少数据回来scan)。
默认值是 1，一次只取一条。

Scan Attribute Selection
scan时建议指定需要的Column Family，减少通信量，否则scan操作默认会返回整个row的所有数据(所有Coulmn Family)。

Close ResultScanners
通过scan取完数据后，记得要关闭ResultScanner，否则RegionServer可能会出现问题(对应的Server资源无法释放)。

Optimal Loading of Row Keys
当你scan一张表的时候，返回结果只需要row key(不需要CF, qualifier,values,timestaps)时，你可以在scan实例中添加一个filterList，并设置 MUST_PASS_ALL 操作，filterList中add FirstKeyOnlyFilter或KeyOnlyFilter。这样可以减少网络通信量。

Turn off WAL on Puts
当Put某些非重要数据时，你可以设置writeToWAL(false)，来进一步提高写性能。writeToWAL(false)会在Put时放弃写WAL log。风险是:当RegionServer宕机时，可能你刚才Put的那些数据会丢失，且无法恢复。

启用Bloom Filter
Bloom Filter通过空间换时间，提高读操作性能。



3.In Memory

创建表的时候，可以通过HColumnDescriptor.setInMemory(true)将表放到RegionServer的缓存中，保证在读取的时候被cache命中。

4.Max Version

创建表的时候，可以通过HColumnDescriptor.setMaxVersions(intmaxVersions)设置表中数据的最大版本，如果只需要保存最新版本的数据，那么可以设置setMaxVersions(1)。

5.Time to Live(设置数据存储的生命周期)

创建表的时候，可以通过HColumnDescriptor.setTimeToLive(inttimeToLive)设置表中数据的存储生命期，过期数据将自动被删除，例如如果只需要存储最近两天的数据，那么可以设置setTimeToLive(2 * 24 * 60 * 60)。

6.Compact & Split

HBase的Compact分为两类：一类叫Minor Compact(部分文件合并), 一类叫Major Compact(全部文件合并). 

两者区别在于：Minor Compact是在Store内StoreFile数量达到阈值(hbase.hstore.blockingStoreFiles, 默认是7)时触发，将Store内的多个小StoreFile合并成一个大的StoreFile.

Major Compact除了将给定Region中一个列族的所有StoreFile合并成一个大的StoreFile外，还会将其中的Delete标记项进行删除。Major Compact是HBase清理被删除记录的唯一机会，因为我们不能保证被删除的记录和墓碑标记记录在同一个Store内。----一个Region只保存一个Table的数据，一张Table的所有数据分布在多个Region上。一个Region包含多个Store。一个Store只保存一个Column Family的数据，一个Column Family的所有数据分布在多个Store内。

由于Major Compact非常消耗资源，实际应用中，可以考虑必要时手动进行。当Region内StoreFile的大小达到一定阈值后，等分Split为两个StoreFile。

7.Pre-Creating Regions

默认情况下，在创建HBase表的时候会自动创建一个Region分区，当导入数据的时候，所有的HBase客户端都向这一个Region写数据，直到这个Region足够大了才进行切分。一种可以加快批量写入速度的方法是通过预先创建一些空的Regions，这样当数据写入HBase时，会按照Region分区情况，在集群内做数据的负载均衡



8.HBase模式设计之ID顺序增长（rowkey顺序增长）
在设计RowKey的时候，常常有应用的RowKey必须包含ID部分，这样才可以支持查询访问。但ID自增长，会导致写入数据的时候压力集中在某一个或少数几个Region上，这是HBase设计的大忌。
经过多个应用的实践，使用ID的二进制反转的方式来避免。
简单说明: 比如ID是Byte型(一般为int或者long，此处为方便解释)，RowKey=ID+timestamp，1,2,3,4……这样增长，对应二进制为0000 0001，0000 0010，0000 0011,0000 0100……，因为前面的bit是不会变化的，所以以ID为RowKey（或者ID打头）的数据写入的时候会集中在一个region上，然后又集中在下一个region上。为此将变化的部分放到RowKey的前面，来分散写入的压力。前面的增长在RowKey的ID上就变成1000 0000， 0100 0000， 1100 0000，0010 0000……我们预分区，假如需要16-1个分区，就可以分为[,0x01)，[0x01,0x02),[0x02,0x03)……[0xFE,0xFF), [0xFF,)，注意算一下，这样，1,2,3,4……就会写到不同的区间上，从而分散到不同的region了。（提醒：为什么只拿ID说事，不考虑timestamp呢，因为HBase的RowKey时字节码比较的，先从高位开始，高位分出胜负，后面就不care了~）

 

优点：转顺序为分散，均衡集群压力；可以做到预分区；不用hash，不用考虑ID的hash碰撞，从而节约存储空间；
限制：scan只能在同一ID打头的rowkey内进行，连续ID的scan不能直接支持，需要程序逻辑处理。



## 根据业务访问特点优化

根据业务访问特点，将Hbase的工作负载大致分为以下四类：

(1)随机读密集型

对于随机读密集型工作负载，高效利用**缓存**和更好地**索引**会给HBase系统带来更高的性能。

(2)顺序读密集型

对于顺序读密集型工作负载，读缓存不会带来太多好处；除非顺序读的规模很小并且限定在一个特定的行键范围内，否则很可能使用缓存会比不使用缓存需要更频繁地访问硬盘。

(3)写密集型

写密集型工作负载的优化方法需要有别于读密集型负载。缓存不再起到重要作用。写操作总是进入MemStore，然后被刷写生成新的Hfile，以后再被合并。获得更好写性能的办法是**不要太频繁刷写、合并或者拆分**，因为在这段时间里IO压力上升，系统会变慢。

(4)混合型

对于完全混合型工作负载，优化方法会变得复杂些。优化时，需要混合调整多个参数来得到一个最优的组合。