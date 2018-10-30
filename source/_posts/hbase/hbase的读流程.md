---
title: hbase的读流程
date: 2017-09-27 22:49:55
tags:
---

和写流程相比，HBase读数据是一个更加复杂的操作流程，这主要基于两个方面的原因：其一是因为整个HBase存储引擎基于LSM-Like树实现，因此一次范围查询可能会涉及多个分片、多块缓存甚至多个数据存储文件；其二是因为HBase中更新操作以及删除操作实现都很简单，更新操作并没有更新原有数据，而是使用时间戳属性实现了多版本。删除操作也并没有真正删除原有数据，只是插入了一条打上”deleted”标签的数据，而真正的数据删除发生在系统异步执行Major_Compact的时候。很显然，这种实现套路大大简化了数据更新、删除流程，但是对于数据读取来说却意味着套上了层层枷锁，读取过程需要根据版本进行过滤，同时对已经标记删除的数据也要进行过滤。

总之，把这么复杂的事情讲明白并不是一件简单的事情，为了更加条理化地分析整个查询过程，接下来笔者会用两篇文章来讲解整个过程，首篇文章主要会从框架的角度粗粒度地分析scan的整体流程，并不会涉及太多的细节实现。大多数看客通过首篇文章基本就可以初步了解scan的工作思路；为了能够从细节理清楚整个scan流程，接着第二篇文章将会在第一篇的基础上引入更多的实现细节以及HBase对于scan所做的基础优化。因为理解问题可能会有纰漏，希望可以一起探讨交流，欢迎拍砖~

### **Client-Server交互逻辑**

运维开发了很长一段时间HBase，经常有业务同学咨询为什么客户端配置文件中没有配置RegionServer的地址信息，这里针对这种疑问简单的做下解释，客户端与HBase系统的交互阶段主要有如下几个步骤：

![795841](http://hbasefly.com/wp-content/uploads/2016/12/795841.png)

****

1. 客户端首先会根据配置文件中zookeeper地址连接zookeeper，并读取/<hbase-rootdir>/meta-region-server节点信息，该节点信息存储HBase元数据（hbase:meta）表所在的RegionServer地址以及访问端口等信息。用户可以通过zookeeper命令(get /<hbase-rootdir>/meta-region-server)查看该节点信息。
2. 根据hbase:meta所在RegionServer的访问信息，客户端会将该元数据表加载到本地并进行缓存。然后在表中确定待检索rowkey所在的RegionServer信息。
3. 根据数据所在RegionServer的访问信息，客户端会向该RegionServer发送真正的数据读取请求。服务器端接收到该请求之后需要进行复杂的处理，具体的处理流程将会是这个专题的重点。

通过上述对客户端以及HBase系统的交互分析，可以基本明确两点：

1. 客户端只需要配置zookeeper的访问地址以及根目录，就可以进行正常的读写请求。不需要配置集群的RegionServer地址列表。
2. 客户端会将hbase:meta元数据表缓存在本地，因此上述步骤中前两步只会在客户端第一次请求的时候发生，之后所有请求都直接从缓存中加载元数据。如果集群发生某些变化导致hbase:meta元数据更改，客户端再根据本地元数据表请求的时候就会发生异常，此时客户端需要重新加载一份最新的元数据表到本地。

－－－－－－－－－－－－－－－－－此处应有华丽丽的分隔线－－－－－－－－－－－－－－－－

RegionServer接收到客户端的get/scan请求之后，先后做了两件事情：构建scanner体系（实际上就是做一些scan前的准备工作），在此体系基础上一行一行检索。举个不太合适但易于理解的例子，scan数据就和开发商盖房一样，也是分成两步：组建施工队体系，明确每个工人的职责；一层一层盖楼。

### **构建scanner体系－组建施工队**

scanner体系的核心在于三层scanner：RegionScanner、StoreScanner以及StoreFileScanner。三者是层级的关系，一个RegionScanner由多个StoreScanner构成，一张表由多个列族组成，就有多少个StoreScanner负责该列族的数据扫描。一个StoreScanner又是由多个StoreFileScanner组成。每个Store的数据由内存中的MemStore和磁盘上的StoreFile文件组成，相对应的，StoreScanner对象会雇佣一个MemStoreScanner和N个StoreFileScanner来进行实际的数据读取，每个StoreFile文件对应一个StoreFileScanner，注意：StoreFileScanner和MemstoreScanner是整个scan的最终执行者。

对应于建楼项目，一栋楼通常由好几个单元楼构成（每个单元楼对应于一个Store），每个单元楼会请一个监工（StoreScanner）负责该单元楼的建造。而监工一般不做具体的事情，他负责招募很多工人（StoreFileScanner），这些工人才是建楼的主体。下图是整个构建流程图：

![818160](http://hbasefly.com/wp-content/uploads/2016/12/818160.png)

****

1.  RegionScanner会根据列族构建StoreScanner，有多少列族就构建多少StoreScanner，用于负责该列族的数据检索

​       1.1 构建StoreFileScanner：每个StoreScanner会为当前该Store中每个HFile构造一个StoreFileScanner，用于实际执行对应文件的检索。同时会为对应Memstore构造一个MemstoreScanner，用于执行该Store中Memstore的数据检索。该步骤对应于监工在人才市场招募建楼所需的各种类型工匠。

​       1.2  过滤淘汰StoreFileScanner：根据Time Range以及RowKey Range对StoreFileScanner以及MemstoreScanner进行过滤，淘汰肯定不存在待检索结果的Scanner。上图中StoreFile3因为检查RowKeyRange不存在待检索Rowkey所以被淘汰。该步骤针对具体的建楼方案，裁撤掉部分不需要的工匠，比如这栋楼不需要地暖安装，对应的工匠就可以撤掉。

​       1.3  Seek rowkey：所有StoreFileScanner开始做准备工作，在负责的HFile中定位到满足条件的起始Row。工匠也开始准备自己的建造工具，建造材料，找到自己的工作地点，等待一声命下。就像所有重要项目的准备工作都很核心一样，Seek过程（此处略过Lazy Seek优化）也是一个很核心的步骤，它主要包含下面三步：

- 定位Block Offset：在Blockcache中读取该HFile的索引树结构，根据索引树检索对应RowKey所在的Block Offset和Block Size
- Load Block：根据BlockOffset首先在BlockCache中查找Data Block，如果不在缓存，再在HFile中加载
- Seek Key：在Data Block内部通过二分查找的方式定位具体的RowKey

整体流程细节参见[《HBase原理-探索HFile索引机制》](http://hbasefly.com/2016/04/03/hbase_hfile_index/)，文中详细说明了HFile索引结构以及如何通过索引结构定位具体的Block以及RowKey

​       1.4  StoreFileScanner合并构建最小堆：将该Store中所有StoreFileScanner和MemstoreScanner合并形成一个heap（最小堆），所谓heap是一个优先级队列，队列中元素是所有scanner，排序规则按照scanner seek到的keyvalue大小由小到大进行排序。这里需要重点关注三个问题，首先为什么这些Scanner需要由小到大排序，其次keyvalue是什么样的结构，最后，keyvalue谁大谁小是如何确定的：

- 为什么这些Scanner需要由小到大排序？

最直接的解释是scan的结果需要由小到大输出给用户，当然，这并不全面，最合理的解释是只有由小到大排序才能使得scan效率最高。举个简单的例子，HBase支持数据多版本，假设用户只想获取最新版本，那只需要将这些数据由最新到最旧进行排序，然后取队首元素返回就可以。那么，如果不排序，就只能遍历所有元素，查看符不符合用户查询条件。这就是排队的意义。

工匠们也需要排序，先做地板的排前面，做墙体的次之，最后是做门窗户的。做墙体的内部还需要再排序，做内墙的排前面，做外墙的排后面，这样，假如设计师临时决定不做外墙的话，就可以直接跳过外墙部分工作。很显然，如果不排序的话，是没办法临时做决定的，因为这部分工作已经可能做掉了。

- HBase中KeyValue是什么样的结构？

​          HBase中KeyValue并不是简单的KV数据对，而是一个具有复杂元素的结构体，其中Key由RowKey，ColumnFamily，Qualifier ，TimeStamp，KeyType等多部分组成，Value是一个简单的二进制数据。Key中元素KeyType表示该KeyValue的类型，取值分别为Put/Delete/Delete Column/Delete Family等。KeyValue可以表示为如下图所示：

![99091](http://hbasefly.com/wp-content/uploads/2016/12/99091.png)

​        了解了KeyValue的逻辑结构后，我们不妨再进一步从原理的角度想想HBase的开发者们为什么如此对其设计。这个就得从HBase所支持的数据操作说起了，HBase支持四种主要的数据操作，分别是Get/Scan/Put/Delete，其中Get和Scan代表数据查询，Put操作代表数据插入或更新（如果Put的RowKey不存在则为插入操作、否则为更新操作），特别需要注意的是HBase中更新操作并不是直接覆盖修改原数据，而是生成新的数据，新数据和原数据具有不同的版本（时间戳）；Delete操作执行数据删除，和数据更新操作相同，HBase执行数据删除并不会马上将数据从数据库中永久删除，而只是生成一条删除记录，最后在系统执行文件合并的时候再统一删除。

​        HBase中更新删除操作并不直接操作原数据，而是生成一个新纪录，那问题来了，如何知道一条记录到底是插入操作还是更新操作亦或是删除操作呢？这正是KeyType和Timestamp的用武之地。上文中提到KeyType取值为分别为Put/Delete/Delete Column/Delete Family四种，如果KeyType取值为Put，表示该条记录为插入或者更新操作，而无论是插入或者更新，都可以使用版本号（Timestamp）对记录进行选择；如果KeyType为Delete，表示该条记录为整行删除操作；相应的KeyType为Delete Column和Delete Family分别表示删除某行某列以及某行某列族操作；

- 不同KeyValue之间如何进行大小比较？

​        上文提到KeyValue中Key由RowKey，ColumnFamily，Qualifier ，TimeStamp，KeyType等5部分组成，HBase设定Key大小首先比较RowKey，RowKey越小Key就越小；RowKey如果相同就看CF，CF越小Key越小；CF如果相同看Qualifier，Qualifier越小Key越小；Qualifier如果相同再看Timestamp，Timestamp越大表示时间越新，对应的Key越小。如果Timestamp还相同，就看KeyType，KeyType按照DeleteFamily -> DeleteColumn -> Delete -> Put 顺序依次对应的Key越来越大。

\2. StoreScanner合并构建最小堆：上文讨论的是一个监工如何构建自己的工匠师团队以及工匠师如何做准备工作、排序工作。实际上，监工也需要进行排序，比如一单元的监工排前面，二单元的监工排之后… StoreScanner一样，列族小的StoreScanner排前面，列族大的StoreScanner排后面。

****

### **scan查询－层层建楼**

构建Scanner体系是为了更好地执行scan查询，就像组建工匠师团队就是为了盖房子一样。scan查询总是一行一行查询的，先查第一行的所有数据，再查第二行的所有数据，但每一行的查询流程却没有什么本质区别。盖房子也一样，无论是盖8层还是盖18层，都需要一层一层往上盖，而且每一层的盖法并没有什么区别。所以实际上我们只需要关注其中一行数据是如何查询的就可以。

对于一行数据的查询，又可以分解为多个列族的查询，比如RowKey=row1的一行数据查询，首先查询列族1上该行的数据集合，再查询列族2里该行的数据集合。同样是盖第一层房子，先盖一单元的一层，再改二单元的一层，盖完之后才算一层盖完，接着开始盖第二层。所以我们也只需要关注某一行某个列族的数据是如何查询的就可以。

还记得Scanner体系构建的最终结果是一个由StoreFileScanner和MemstoreScanner组成的heap（最小堆）么，这里就派上用场了。下图是一张表的逻辑视图，该表有两个列族cf1和cf2（我们只关注cf1），cf1只有一个列name，表中有5行数据，其中每个cell基本都有多个版本。cf1的数据假如实际存储在三个区域，memstore中有r2和r4的最新数据，hfile1中是最早的数据。现在需要查询RowKey=r2的数据，按照上文的理论对应的Scanner指向就如图所示：

![544501](http://hbasefly.com/wp-content/uploads/2016/12/544501.png)

这三个Scanner组成的heap为<MemstoreScanner，StoreFileScanner2, StoreFileScanner1>，Scanner由小到大排列。查询的时候首先pop出heap的堆顶元素，即MemstoreScanner，得到keyvalue = r2:cf1:name:v3:name23的数据，拿到这个keyvalue之后，需要进行如下判定：

1. 检查该KeyValue的KeyType是否是Deleted/DeletedCol等，如果是就直接忽略该列所有其他版本，跳到下列（列族）
2. 检查该KeyValue的Timestamp是否在用户设定的Timestamp Range范围，如果不在该范围，忽略
3. 检查该KeyValue是否满足用户设置的各种filter过滤器，如果不满足，忽略
4. 检查该KeyValue是否满足用户查询中设定的版本数，比如用户只查询最新版本，则忽略该cell的其他版本；反正如果用户查询所有版本，则还需要查询该cell的其他版本。

现在假设用户查询所有版本而且该keyvalue检查通过，此时当前的堆顶元素需要执行next方法去检索下一个值，并重新组织最小堆。即图中MemstoreScanner将会指向r4，重新组织最小堆之后最小堆将会变为<StoreFileScanner2, StoreFileScanner1, MemstoreScanner>，堆顶元素变为StoreFileScanner2，得到keyvalue＝r2:cf1:name:v2:name22，进行一系列判定，再next，再重新组织最小堆…

不断重复这个过程，直至一行数据全部被检索得到。继续下一行…

－－－－－－－－－－－－－－－－此处应有华丽丽的分隔符－－－－－－－－－－－－－－－－

本文从框架层面对HBase读取流程进行了详细的解析，文中并没有针对细节进行深入分析，一方面是担心个人能力有限，引入太多细节会让文章难于理解，另一方面是大多数看官可能对细节并不关心，下篇文章笔者会揪出来一些比较重要的细节和大家一起交流～

文章最后，贴出来一个一些朋友咨询的问题：Memstore在flush的时候会不会将Blockcache中的数据update？如果不update的话不就会产生脏读，读到以前的老数据？



回顾一下scan的整个流程，如下图所示：

![55](http://hbasefly.com/wp-content/uploads/2017/06/55.png)

上图是一个简单的示意图，用户如果对整个流程比较感兴趣，可以阅读之前的文章，本文将会关注于隐藏在这个示意图中的核心细节。这里笔者挑出了其中五个比较重要的问题来说明，这些问题都是本人之前或早或晚比较困惑的问题，拿出来与大家分享。当然，如果大家有反馈想了解的其他细节，也可以单独交流探讨。

\1. 常说HBase数据读取要读Memstore、HFile和Blockcache，为什么上面Scanner只有StoreFileScanner和MemstoreScanner两种？没有BlockcacheScanner?

HBase中数据仅仅独立地存在于Memstore和StoreFile中，Blockcache中的数据只是StoreFile中的部分数据（热点数据），即所有存在于Blockcache的数据必然存在于StoreFile中。因此MemstoreScanner和StoreFileScanner就可以覆盖到所有数据。实际读取时StoreFileScanner通过索引定位到待查找key所在的block之后，首先检查该block是否存在于Blockcache中，如果存在直接取出，如果不存在再到对应的StoreFile中读取。

\2.  数据更新操作先将数据写入Memstore，再落盘。落盘之后需不需要更新Blockcache中对应的kv？如果不更新，会不会读到脏数据？

如果理清楚了第一个问题，相信很容易得出这个答案：不需要更新Blockcache中对应的kv，而且不会读到脏数据。数据写入Memstore落盘会形成新的文件，和Blockcache里面的数据是相互独立的，以多版本的方式存在。

\3. 读取流程中如何使用BloomFilter(简称BF)对StoreFile进行过滤？

过滤StoreFile发生在上图中第三步，过滤手段主要有三种：根据KeyRange过滤、根据TimeRange过滤、根据BF过滤。下面分别进行介绍：

（1）根据KeyRange过滤：因为StoreFile是中所有KV数据都是有序排列的，所以如果待检索row范围［startrow，stoprow］与文件起始key范围［firstkey，lastkey］没有交集，比如stoprow < firstkey 或者 startrow > lastkey，就可以过滤掉该StoreFile。 

（2）根据TimeRange过滤：StoreFile中元数据有一个关于该File的TimeRange属性［minimumTimestamp, maxmumTimestamp］，因此待检索的TimeRange如果与该文件时间范围没有交集，就可以过滤掉该StoreFile；另外，如果该文件所有数据已经过期，也可以过滤淘汰。

（3）根据BF过滤：BF在几乎所有的LSM模型存储领域都会用到，可说是标配，比如HBase、Kudu、RocksDB等等，用法也是如出一辙，和HBase一样，主要用来读取数据时过滤部分文件；除此之外，BF在大数据计算（分布式Join实现）中也扮演重要的角色，参考Impala中Hash Join的实现（戳[这里](http://hbasefly.com/2017/04/10/bigdata-join-2/)）。BF的具体工作原理笔者假设童鞋都了解（不了解的童鞋可以参考上述链接文章）。

现在来看看HBase中如何利用BF对StoreFile进行过滤(注：接下来所有关于HBase BF的说明都按照Row类型来，Row-Column类型类似)，原理其实很简单：首先把BF数据加载到内存；然后使用hash函数对待检索row进行hash，根据hash后的结果在BF数据中进行寻址查看即可确定是否存在该HFile。第二步就是BF的原理，并没有什么好讲的，主要来看看HBase是如何将BF数据加载到内存的。

看过笔者之前文章的童鞋都知道，BF数据实际上是和用户KV数据一样存储在HFile中的，那就需要先看看BF信息是如何存储在HFile中的，查看[官方文档](http://hbase.apache.org/book.html#_hfile_format_2)中HFile(v2)组织结构图如下：

![56](http://hbasefly.com/wp-content/uploads/2017/06/56.png)

HFile组织结构中关于BF有两个非常重要的结构－Bloom Block与Bloom Index。Bloom Block主要存储BF的实际数据，可能这会大家要问为什么Bloom Block要分布在整个HFile？分布的具体位置如何确定？其实很简单，HBase在写数据的时候就会根据row生成对应的BF信息并写到一个Block中，随着用户数据的不断写入，这个BF Block就会不断增大，当增大到一定阈值之后系统就会重新生成一个新Block，旧Block就会顺序加载到Data Block之后。这里隐含了一个关键的信息，随着单个文件的增大，BF信息会逐渐变的很大，并不适合一次性全部加载到内存，更适合的使用方式是使用哪块加载哪块！

这些Bloom Block分散在HFile中的各个角落，就会带来一个问题：如何有效快速定位到这些BF Block？这就是Bloom Index的核心作用，与Data Index相同，Bloom Index也是一颗B+树，Bloom Index Block结构如下图所示：

![57](http://hbasefly.com/wp-content/uploads/2017/06/57.png)

上图需要重点关注Bloom Block的Block Key：Block中第一个原始KV的RowKey。这样给定一个待检索的 rowkey，就可以很容易地通过Bloom Index定位到具体的Bloom Block，将Block加载到内存进行过滤。通常情况下，热点Bloom Block会常驻内存的！

到此为止，笔者已经解释清楚了HBase是如何利用BF在读取数据时根据rowkey过滤StoreFile的，相信Kudu、RocksDB中BF的原理基本相同。

再回到出发的地方，我们说在实际scan之前就要使用BF对StoreFile进行过滤，那仔细想下，到底用哪个rowkey过滤？实际实现中系统使用scan的startrow作为过滤条件进行过滤，这是不是有问题？举个简单的例子，假设小明检索的数据为［row1, row4］，如果此文件不包含row1，而包含row2，这样在scan前你利用row1就把该文件淘汰掉了，row2这条数据怎么办？不是会被遗漏？

这里系统实现有个隐藏点，scan之前使用BF进行过滤只针对get查询以及scan单条数据的场景，scan多条数据并不会执行实际的BF过滤，而是在实际seek到新一行的时候才会启用BF根据新一行rowkey对所有StoreFile过滤。

\4. 最小堆中弹出cell之后如何对该cell进行检查过滤，确保满足用户设置条件？检查过滤之后是继续弹出下一个cell，还是跳过部分cell重新seek到下一列或者下一行？

scan之所以复杂，很大程度上是因为scan可以设置的条件非常之多，下面所示代码为比较常规的一些设置：

```
Scan scan = new Scan();
scan.withStartRow(startRow) //设置检索起始row
        .withStopRow(stopRow) //设置检索结束row
        .setFamilyMap(Map<byte[], Set<byte[]> familyMap>) //设置检索的列族和对应列族下的列集合
        .setTimeRange(minStamp, maxStamp) // 设置检索TimeRange
        .setMaxVersions(maxVersions) //设置检索的最大版本号
        .setFilter(filter) //设置检索过滤器
        …
```

在整个Scan流程的第6步，将堆顶kv元素出堆进行检查，实际上主要检查两个方面，其一是非用户条件检查，比如kv是否已经过期（列族设置TTL）、kv是否已经被删除，这些检查和用户设置查询条件没有任何关系；其二就是检查该kv是否满足用户设置的这些查询条件，代码逻辑还是比较清晰的，在此不再赘述。核心代码主要参考ScanQueryMatcher.match(cell)方法。

相比堆顶元素检查流程，笔者更想探讨堆顶元素kv检查之后的返回值－MatchCode，这个Code可不简单，它会告诉scanner是继续seek下一个cell，还是直接跳过部分cell直接seek到下一列（对应INCLUDE_AND_SEEK_NEXT_COL或SEEK_NEXT_COL），抑或是直接seek到下一行(对应INCLUDE_AND_SEEK_NEXT_ROW或SEEK_NEXT_ROW)。还是举一个简单的例子：

![58](http://hbasefly.com/wp-content/uploads/2017/06/58.png)

上图是待查表，含有一个列族cf，列族下有四个列[c1, c2, c3, c4]，列族设置MaxVersions为2，即允许最多存在2个版本。现在简单构造一个查询语句如下：

```
Scan scan = new Scan(r1, r4); // 表示检索范围为［r1, r4］
scan.setFamilyMap(Map<cf, Set<c1,c2>>) //仅检索列族cf下的c1列和c2列
        .setMaxVersions(1) //设置检索的最大版本号为1
```

下面分别模拟直接跳过部分纪录seek到下一列（INCLUDE_AND_SEEK_NEXT_COL）的场景以及跳过部分列直接seek到下一行（INCLUDE_AND_SEEK_NEXT_ROW）的场景：

（1）假设当前检索r1行，堆顶元素为cf:c1下的kv1(版本为v1)，按照设置条件中检索的最大版本号为1，其他条件都满足的情况下就可以直接跳过kv2直接seek到下一列－c2列。这种场景下就会返回INCLUDE_AND_SEEK_NEXT_COL。

（2）假设当前检索r1行，堆顶元素为cf:c2下的kv3(仅有1个版本)，满足设置的版本条件，系统检测到c2是检索的最后一列之后（c3、c4并不需要检索），就会返回指示－略过c3、c4直接seek到下一行。这种场景下就会返回INCLUDE_AND_SEEK_NEXT_ROW。

至此，笔者针对scan流程中的第6步进行了比较详细的解读，对认为比较重要的点进行了简单演示。其实还是有很多内容，但大多都大同小异，原理类似。有兴趣读HBase源码的同学可以参考这里的解读，相信会有所帮助。

\5. 每次seek（key）命令是不是都需要所有scanner真正seek到指定key？延迟seek是如何优化读性能的？

这是本文探讨的最后一个话题，严格来说，这个话题并不涉及scan的流程，而仅仅是对scan的一项优化。但是个人认为理解这项优化对scan的流程理解有着相当重要的意义，同时也是阅读HBase-Scan模块源码必须要迈过的一道坎。

先回到scan的流程，根据之前的理解，如果堆顶元素出堆检查之后指示scanner需要跳过部分cell直接seek到下一列或者下一行，此时所有scanner都需要按照指示执行seek命令定位指定位置，这本身没有毛病。然而这可能并不高效，试想这么一种场景：

（1）当前有3个StoreFile文件，因此对应3个StoreFileScanner，现在接到指示需要seek 到(rowk, cf:c1)位置，刚好这三个文件中都存在这样的KV，差别在于时间戳不同

（2）于是这3个Scanner很顺从地在文件中找到指定位置，然后等待最小KV出堆接受检查

（3）最小KV出堆接受检查之后满足用户条件，而且用户只需要检索最新版本。因此检查之后告诉所有scanner直接seek到下一行。

有没有发现一些小小的问题？没错，3个scanner只有1个scanner做了’有用功’，其他两个scanner都做了’无用seek’。这很显然一定程度上会影响scan性能。

HBase提出了一个很巧妙的应对方案－延迟seek，就是3个scanner接到seek指示的时候，实际上并没有真正去做，而只是将scanner的指针指向指定位置。那童鞋就会问了，那什么时候真正去seek呢？只需要在堆顶元素弹出来的时候真正去执行就可以。这样，就可以有效避免大量’无用seek’。

好了，本文核心内容就基本介绍完了，接下来扯点闲篇。任何存储系统的核心模块无非读写模块，但不同类型的数据库侧重不同。MySQL类系统（Oracle、SQLServer等）侧重于写，写就是它的灵魂！为了实现事务原子性，数据更新之前要先写undo log，为了实现数据持久性，又引入redo log，为了实现事务隔离性，还需要实现各种锁，还有类似double write等一系列机制…… ，个人认为，搞懂了数据更新写入流程基本就搞懂了MySQL存储引擎。与MySQL相对，HBase类系统（RocksDB、Kudu ）更侧重读，读是它的灵魂！HBase将所有更新操作、删除操作都简单的当作写入操作来处理，对于更新删除来说确实简单了，但却给数据读取带来了极大的负担，数据读取的时候需要额外过滤删除数据、处理多版本数据，除此之外，LSM所特有的多文件存储、BloomFilter过滤特性支持等等无不增加了数据读取的难度。个人认为，只有搞懂了数据读取才可能真正理解HBase内核。