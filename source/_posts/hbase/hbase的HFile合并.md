---
title: hbase的HFile合并
date: 2017-09-21 21:24:35
tags:
- hbase
categories:
- 大数据
---

了解HBase的童鞋都知道，HBase是一种Log-Structured Merge Tree架构模式，用户数据写入先写WAL，再写缓存，满足一定条件后缓存数据会执行flush操作真正落盘，形成一个数据文件HFile。随着数据写入不断增多，flush次数也会不断增多，进而HFile数据文件就会越来越多。然而，太多数据文件会导致数据查询IO次数增多，因此HBase尝试着不断对这些文件进行合并，这个合并过程称为Compaction。

Compaction会从一个region的一个store中选择一些hfile文件进行合并。合并说来原理很简单，先从这些待合并的数据文件中读出KeyValues，再按照由小到大排列后写入一个新的文件中。之后，这个新生成的文件就会取代之前待合并的所有文件对外提供服务。HBase根据合并规模将Compaction分为了两类：MinorCompaction和MajorCompaction

- Minor Compaction是指选取一些小的、相邻的StoreFile将他们合并成一个更大的StoreFile，在这个过程中不会处理已经Deleted或Expired的Cell。一次Minor Compaction的结果是更少并且更大的StoreFile。
- Major Compaction是指将所有的StoreFile合并成一个StoreFile，这个过程还会清理三类无意义数据：被删除的数据、TTL过期数据、版本号超过设定版本号的数据。另外，一般情况下，Major Compaction时间会持续比较长，整个过程会消耗大量系统资源，对上层业务有比较大的影响。因此线上业务都会将关闭自动触发Major Compaction功能，改为手动在业务低峰期触发。

### **Compaction作用 | 副作用**

上文提到，随着hfile文件数不断增多，一次查询就可能会需要越来越多的IO操作，延迟必然会越来越大，如下图一所示，随着数据写入不断增加，文件数不断增多，读取延时也在不断变大。而执行compaction会使得文件数基本稳定，进而IO Seek次数会比较稳定，延迟就会稳定在一定范围。然而，compaction操作重写文件会带来很大的带宽压力以及短时间IO压力。因此可以认为，Compaction就是使用短时间的IO消耗以及带宽消耗换取后续查询的低延迟。从图上来看，就是延迟有很大的毛刺，但总体趋势基本稳定不变，见下图二。

![11](http://hbasefly.com/wp-content/uploads/2016/07/11.png)

![22](http://hbasefly.com/wp-content/uploads/2016/07/22.png)

为了换取后续查询的低延迟，除了短时间的读放大之外，Compaction对写入也会有很大的影响。我们首先假设一个现象：当写请求非常多，导致不断生成HFile，但compact的速度远远跟不上HFile生成的速度，这样就会使HFile的数量会越来越多，导致读性能急剧下降。为了避免这种情况，在HFile的数量过多的时候会限制写请求的速度：在每次执行MemStore flush的操作前，如果HStore的HFile数超过hbase.hstore.blockingStoreFiles （默认7），则会阻塞flush操作hbase.hstore.blockingWaitTime时间，在这段时间内，如果compact操作使得HStore文件数下降到回这个值，则停止阻塞。另外阻塞超过时间后，也会恢复执行flush操作。这样做就可以有效地控制大量写请求的速度，但同时这也是影响写请求速度的主要原因之一。

可见，Compaction会使得数据读取延迟一直比较平稳，但付出的代价是大量的读延迟毛刺和一定的写阻塞。

### Compaction流程

了解了一定的背景知识后，接下来需要从全局角度对Compaction进行了解。整个Compaction始于特定的触发条件，比如flush操作、周期性地Compaction检查操作等。一旦触发，HBase会将该Compaction交由一个独立的线程处理，该线程首先会从对应store中选择合适的hfile文件进行合并，这一步是整个Compaction的核心，选取文件需要遵循很多条件，比如文件数不能太多、不能太少、文件大小不能太大等等，最理想的情况是，选取那些承载IO负载重、文件小的文件集，实际实现中，HBase提供了多个文件选取算法：RatioBasedCompactionPolicy、ExploringCompactionPolicy和StripeCompactionPolicy等，用户也可以通过特定接口实现自己的Compaction算法；选出待合并的文件后，HBase会根据这些hfile文件总大小挑选对应的线程池处理，最后对这些文件执行具体的合并操作。可以通过下图简单地梳理上述流程：

![33](http://hbasefly.com/wp-content/uploads/2016/07/33.png)

#### **触发时机**

HBase中可以触发compaction的因素有很多，最常见的因素有这么三种：Memstore Flush、后台线程周期性检查、手动触发。

\1. Memstore Flush: 应该说compaction操作的源头就来自flush操作，memstore flush会产生HFile文件，文件越来越多就需要compact。因此在每次执行完Flush操作之后，都会对当前Store中的文件数进行判断，一旦文件数＃ > ，就会触发compaction。需要说明的是，compaction都是以Store为单位进行的，而在Flush触发条件下，整个Region的所有Store都会执行compact，所以会在短时间内执行多次compaction。

\2. 后台线程周期性检查：后台线程CompactionChecker定期触发检查是否需要执行compaction，检查周期为：hbase.server.thread.wakefrequency*hbase.server.compactchecker.interval.multiplier。和flush不同的是，该线程优先检查文件数＃是否大于，一旦大于就会触发compaction。如果不满足，它会接着检查是否满足major compaction条件，简单来说，如果当前store中hfile的最早更新时间早于某个值mcTime，就会触发major compaction，HBase预想通过这种机制定期删除过期数据。上文mcTime是一个浮动值，浮动区间默认为［7-7*0.2，7+7*0.2］，其中7为hbase.hregion.majorcompaction，0.2为hbase.hregion.majorcompaction.jitter，可见默认在7天左右就会执行一次major compaction。用户如果想禁用major compaction，只需要将参数hbase.hregion.majorcompaction设为0

\3. 手动触发：一般来讲，手动触发compaction通常是为了执行major compaction，原因有三，其一是因为很多业务担心自动major compaction影响读写性能，因此会选择低峰期手动触发；其二也有可能是用户在执行完alter操作之后希望立刻生效，执行手动触发major compaction；其三是HBase管理员发现硬盘容量不够的情况下手动触发major compaction删除大量过期数据；无论哪种触发动机，一旦手动触发，HBase会不做很多自动化检查，直接执行合并。

#### **选择合适HFile合并**

选择合适的文件进行合并是整个compaction的核心，因为合并文件的大小以及其当前承载的IO数直接决定了compaction的效果。最理想的情况是，这些文件承载了大量IO请求但是大小很小，这样compaction本身不会消耗太多IO，而且合并完成之后对读的性能会有显著提升。然而现实情况可能大部分都不会是这样，在0.96版本和0.98版本，分别提出了两种选择策略，在充分考虑整体情况的基础上选择最佳方案。无论哪种选择策略，都会首先对该Store中所有HFile进行一一排查，排除不满足条件的部分文件：

\1. 排除当前正在执行compact的文件及其比这些文件更新的所有文件（SequenceId更大）

\2. 排除某些过大的单个文件，如果文件大小大于hbase.hzstore.compaction.max.size（默认Long最大值），则被排除，否则会产生大量IO消耗

经过排除的文件称为候选文件，HBase接下来会再判断是否满足major compaction条件，如果满足，就会选择全部文件进行合并。判断条件有下面三条，只要满足其中一条就会执行major compaction：

\1. 用户强制执行major compaction

2. 长时间没有进行compact（CompactionChecker的判断条件2）且候选文件数小于hbase.hstore.compaction.max（默认10）

\3. Store中含有Reference文件，Reference文件是split region产生的临时文件，只是简单的引用文件，一般必须在compact过程中删除

如果不满足major compaction条件，就必然为minor compaction，HBase主要有两种minor策略：RatioBasedCompactionPolicy和ExploringCompactionPolicy，下面分别进行介绍：

**RatioBasedCompactionPolicy**

从老到新逐一扫描所有候选文件，满足其中条件之一便停止扫描：

（1）当前文件大小 < 比它更新的所有文件大小总和 * ratio，其中ratio是一个可变的比例，在高峰期时ratio为1.2，非高峰期为5，也就是非高峰期允许compact更大的文件。那什么时候是高峰期，什么时候是非高峰期呢？用户可以配置参数hbase.offpeak.start.hour和hbase.offpeak.end.hour来设置高峰期

（2）当前所剩候选文件数 <= hbase.store.compaction.min（默认为3）

停止扫描后，待合并文件就选择出来了，即为当前扫描文件+比它更新的所有文件

**ExploringCompactionPolicy**

该策略思路基本和RatioBasedCompactionPolicy相同，不同的是，Ratio策略在找到一个合适的文件集合之后就停止扫描了，而Exploring策略会记录下所有合适的文件集合，并在这些文件集合中寻找最优解。最优解可以理解为：待合并文件数最多或者待合并文件数相同的情况下文件大小较小，这样有利于减少compaction带来的IO消耗。具体流程戳[这里](http://my.oschina.net/u/220934/blog/363270)

需要注意的是，Ratio策略是0.94版本的默认策略，而0.96版本之后默认策略就换为了Exploring策略，在cloudera博文[《what-are-hbase-compactions》](http://blog.cloudera.com/blog/2013/12/what-are-hbase-compactions/)中，作者给出了一个两者的简单性能对比，基本可以看出后者在节省IO方面会有10%左右的提升：

![44](http://hbasefly.com/wp-content/uploads/2016/07/44.png)

截止到此，HBase基本上就选择出来了待合并的文件集合，后续通过挑选合适的处理线程，就会对这些文件进行真正的合并 。

#### **挑选合适的线程池**

HBase实现中有一个专门的线程CompactSplitThead负责接收compact请求以及split请求，而且为了能够独立处理这些请求，这个线程内部构造了多个线程池：largeCompactions、smallCompactions以及splits等，其中splits线程池负责处理所有的split请求，largeCompactions和smallCompaction负责处理所有的compaction请求，其中前者用来处理大规模compaction，后者处理小规模compaction。这里需要明白三点：

\1. 上述设计目的是为了能够将请求独立处理，提供系统的处理性能。

\2. 哪些compaction应该分配给largeCompactions处理，哪些应该分配给smallCompactions处理？是不是Major Compaction就应该交给largeCompactions线程池处理？不对。这里有个分配原则：待compact的文件总大小如果大于值throttlePoint（可以通过参数hbase.regionserver.thread.compaction.throttle配置，默认为2.5G），分配给largeCompactions处理，否则分配给smallCompactions处理。

\3. largeCompactions线程池和smallCompactions线程池默认都只有一个线程，用户可以通过参数hbase.regionserver.thread.compaction.large和hbase.regionserver.thread.compaction.small进行配置

#### **执行HFile文件合并**

上文一方面选出了待合并的HFile集合，一方面也选出来了合适的处理线程，万事俱备，只欠最后真正的合并。合并流程说起来也简单，主要分为如下几步：

\1. 分别读出待合并hfile文件的KV，并顺序写到位于./tmp目录下的临时文件中

\2. 将临时文件移动到对应region的数据目录

\3. 将compaction的输入文件路径和输出文件路径封装为KV写入WAL日志，并打上compaction标记，最后强制执行sync

\4. 将对应region数据目录下的compaction输入文件全部删除

上述四个步骤看起来简单，但实际是很严谨的，具有很强的容错性和完美的幂等性：

\1. 如果RS在步骤2之前发生异常，本次compaction会被认为失败，如果继续进行同样的compaction，上次异常对接下来的compaction不会有任何影响，也不会对读写有任何影响。唯一的影响就是多了一份多余的数据。

\2. 如果RS在步骤2之后、步骤3之前发生异常，同样的，仅仅会多一份冗余数据。

\3. 如果在步骤3之后、步骤4之前发生异常，RS在重新打开region之后首先会从WAL中看到标有compaction的日志，因为此时输入文件和输出文件已经持久化到HDFS，因此只需要根据WAL移除掉compaction输入文件即可





compaction的核心作用是通过合并大量小文件为一个大文件来减少hfile的总数量，进而保证读延迟的稳定。合并文件首先是读出所有小文件的KVs，再写入同一个大文件，这个过程会带来严重的IO压力和带宽压力，对整个系统的读请求和写请求带来不同程度的影响。

因此HBase对于compaction的设计总是会追求一个平衡点，一方面需要保证compaction的基本效果，另一方面又不会带来严重的IO压力。然而，并没有一种设计策略能够适用于所有应用场景或所有数据集。在意识到这样的问题之后，HBase就希望能够提供一种机制可以在不同业务场景下针对不同设计策略进行测试，另一方面也可以让用户针对自己的业务场景选择合适的compaction策略。因此，在0.96版本中HBase对架构进行了一定的调整，一方面提供了Compaction插件接口，用户只需要实现这些特定的接口，就可以根据自己的应用场景以及数据集定制特定的compaction策略。另一方面，0.96版本之后Compaction可以支持table/cf粒度的策略设置，使得用户可以根据应用场景为不同表/列族选择不同的compaction策略，比如：

```
alter ’table1’ , CONFIGURATION => {‘hbase.store.engine.class’ => ‘org.apache.hadoop.hbase.regionserver.StripStoreEngine’, … } 
```

上述两方面的调整为compaction的改进和优化提供了最基本的保障，同时提出了一个非常重要的理念：compaction到底选择什么样的策略需要根据不同的业务场景、不同数据集特征进行确定。那接下来就根据不同的应用场景介绍几种不同的compaction策略。

在介绍具体的compaction策略之前，还是有必要对优化compaction的共性特征进行提取，总结起来有如下几个方面：

\1. 减少参与compaction的文件数：这个很好理解，实现起来却比较麻烦，首先需要将文件根据rowkey、version或其他属性进行分割，再根据这些属性挑选部分重要的文件参与合并；另一方面，尽量不要合并那些大文件，减少参与合并的文件数。

2. 不要合并那些不需要合并的文件：比如OpenTSDB应用场景下的老数据，这些数据基本不会查询到，因此不进行合并也不会影响查询性能

\3. 小region更有利于compaction：大region会生成大量文件，不利于compaction；相反，小region只会生成少量文件，这些文件合并不会引起很大的IO放大

接下来就介绍几个典型的compaction策略以及其适应的应用场景：

### **FIFO Compaction（HBASE-14468）**

FIFO Compaction策略主要参考了[rocksdb的实现](https://github.com/facebook/rocksdb/wiki/FIFO-compaction-style)，它会选择那些过期的数据文件，即该文件内所有数据都已经过期。因此，对应业务的列族必须设置TTL，否则肯定不适合该策略。需要注意的是，该策略只做这么一件事情：收集所有已经过期的文件并删除。这样的应用场景主要包括：

\1. 大量短时间存储的原始数据，比如推荐业务，上层业务只需要最近时间内用户的行为特征，利用这些行为特征进行聚合为用户进行推荐。再比如Nginx日志，用户只需要存储最近几天的日志，方便查询某个用户最近一段时间的操作行为等等

\2. 所有数据能够全部加载到block cache（RAM/SSD），假如HBase有1T大小的SSD作为block cache，理论上就完全不需要做合并，因为所有读操作都是内存操作。

因为FIFO Compaction只是收集所有过期的数据文件并删除，并没有真正执行重写（几个小文件合并成大文件），因此不会消耗任何CPU和IO资源，也不会从block cache中淘汰任何热点数据。所以，无论对于读还是写，该策略都会提升吞吐量、降低延迟。

开启FIFO Compaction（表设置&列族设置）

```
HTableDescriptor desc = new HTableDescriptor(tableName);
    desc.setConfiguration(DefaultStoreEngine.DEFAULT_COMPACTION_POLICY_CLASS_KEY, 
      FIFOCompactionPolicy.class.getName());
```

```
HColumnDescriptor desc = new HColumnDescriptor(family);
    desc.setConfiguration(DefaultStoreEngine.DEFAULT_COMPACTION_POLICY_CLASS_KEY, 
      FIFOCompactionPolicy.class.getName());
```

### **Tier-Based Compaction（HBASE-7055）（HBASE-14477）**

之前所讲到的所有‘文件选取策略’实际上都不够灵活，基本上没有考虑到热点数据的情况。然而现实业务中，有很大比例的业务都存在明显的热点数据，而其中最常见的情况是：最近写入到的数据总是最有可能被访问到，而老数据被访问到的频率就相对比较低。按照之前的文件选择策略，并没有对新文件和老文件进行一定的‘区别对待’，每次compaction都有可能会有很多老文件参与合并，这必然会影响compaction效率，却对降低读延迟没有太大的帮助。

针对这种情况，HBase社区借鉴Facebook HBase分支的解决方案，引入了Tier-Based Compaction。这种方案会根据候选文件的新老程度将其分为多个不同的等级，每个等级都有对应等级的参数，比如参数Compation Ratio，表示该等级文件选择时的选择几率，Ratio越大，该等级的文件越有可能被选中参与Compaction。而等级数、每个等级参数都可以通过CF属性在线更新。

可见，Tier-Based Compaction方案通过引入时间等级和Compaction Ratio等概念，使得Compaction更加灵活，不同业务场景只需要调整参数就可以达到更好的Compaction效率。目前HBase计划在2.0.0版本发布基于时间划分等级的实现方式－Date Tierd Compaction Policy，后续我们也重点基于该方案进行介绍。

该方案的具体实现思路，HBase更多地参考了Cassandra的实现方案：基于时间窗的时间概念。如下图所示，时间窗的大小可以进行配置，其中参数base_time_seconds代表初始化时间窗的大小，默认为1h，表示最近一小时内flush的文件数据都会落入这个时间窗内，所有想读到最近一小时数据请求只需要读取这个时间窗内的文件即可。后面的时间窗窗口会越来越大，另一个参数max_age_days表示比其更老的文件不会参与compaction。

![1](http://hbasefly.com/wp-content/uploads/2016/07/1-1.png)

![312737.png](file://c:/Users/hzfanxinxin/AppData/Local/YNote/data/hzfanxinxin@corp.netease.com/1326b0125fb44c708cc9788ca161981f/312737.png)

上图所示，时间窗随着时间推移朝右移动，图一中没有任何时间窗包含4个（可以通过参数min_thresold配置）文件，因此compaction不会被触发。随着时间推移来到图二所示状态，此时就有一个时间窗包含了4个HFile文件，compaction就会被触发，这四个文件就会被合并为一个大文件。

对比上文说到的分级策略以及Compaction Ratio参数，Cassandra的实现方案中通过设置多个时间窗来实现分级，时间窗的窗口大小类似于Compaction Ratio参数的作用，可以通过调整时间窗的大小来调整不同时间窗文件选择的优先级，比如可以将最右边的时间窗窗口调大，那新文件被选择参与Compaction的概率就会大大增加。然而，这个方案里面并没有类似于当前HBase中的Major Compaction策略来实现过期文件清理的功能，只能借助于TTL来主动清理过期的文件，比如这个文件中所有数据都过期了，就可以将这个文件清理掉。

因此，我们可以总结得到使用Date Tierd Compaction Policy需要遵守的原则：

\1. 特别适合使用的场景：时间序列数据，默认使用TTL删除。类似于“获取最近一小时／三小时／一天”场景，同时不会执行delete操作。最典型的例子就是基于Open-TSDB的监控系统，如下图所示：

![2](http://hbasefly.com/wp-content/uploads/2016/07/2-1.png)

![372163.png](file://c:/Users/hzfanxinxin/AppData/Local/YNote/data/hzfanxinxin@corp.netease.com/5f2126df4edc4a69a3ec222662a25863/372163.png)

\2. 比较适合的应用场景：时间序列数据，但是会有全局数据的更新操作以及少部分的删除操作。

\3. 不适合的应用场景：非时间序列数据，或者大量的更新数据更新操作和删除操作。

### **Stripe Compaction （HBASE-7667）**

通常情况下，major compaction都是无法绕过的，很多业务都会执行delete/update操作，并设置TTL和Version，这样就需要通过执行major compaction清理被删除的数据以及过期版本数据、过期TTL数据。然而，接触过HBase的童鞋都知道，major compaction是一个特别昂贵的操作，会消耗大量系统资源，而且执行一次可能会持续几个小时，严重影响业务应用。因此，一般线上都会选择关闭major compaction自动触发，而是选择在业务低峰期的时候手动触发。为了彻底消除major compaction所带来的影响，hbase社区提出了strip compaction方案。

其实，解决major compaction的最直接办法是减少region的大小，最好整个集群都是由很多小region组成，这样参与compaction的文件总大小就必然不会太大。可是，region设置小会导致region数量很多，这一方面会导致hbase管理region的开销很大，另一方面，region过多也要求hbase能够分配出来更多的内存作为memstore使用，否则有可能导致整个regionserver级别的flush，进而引起长时间的写阻塞。因此单纯地通过将region大小设置过小并不能本质解决问题。

#### **Level Compaction**

此时，社区开发者将目光转向了leveldb的compaction策略：level compaction。level compaction设计思路是将store中的所有数据划分为很多层，每一层都会有一部分数据，如下图所示：

![3](http://hbasefly.com/wp-content/uploads/2016/07/3-1.png)

![663348.png](file://c:/Users/hzfanxinxin/AppData/Local/YNote/data/hzfanxinxin@corp.netease.com/273f13693df9498eaa6d8af45f25f41d/663348.png)

\1. 数据组织形式不再按照时间前后进行组织，而是按照KeyRange进行组织，每个KeyRange中会包含多个文件，这些文件所有数据的Key必须分布在同一个范围。比如Key分布在Key0~KeyN之间的所有数据都会落在第一个KeyRange区间的文件中，Key分布在KeyN+1~KeyT之间的所有数据会分布在第二个区间的文件中，以此类推。

\2. 整个数据体系会被划分为很多层，最上层（Level 0）表示最新数据，最下层（Level 6）表示最旧数据。每一层都由大量KeyRange块组成（Level 0除外），KeyRange之间没有Key重合。而且层数越大，对应层的每个KeyRange块大小越大，下层KeyRange块大小是上一层大小的10倍。图中range颜色越深，对应的range块越大。

\3. 数据从Memstore中flush之后，会首先落入Level 0，此时落入Level 0的数据可能包含所有可能的Key。此时如果需要执行compaction，只需要将Level 0中的KV一个一个读出来，然后按照Key的分布分别插入Level 1中对应KeyRange块的文件中，如果此时刚好Level 1中的某个KeyRange块大小超过了一定阈值，就会继续往下一层合并。

\4. level compaction依然会有major compaction的概念，发生major compaction只需要将部分Range块内的文件执行合并就可以，而不需要合并整个region内的数据文件。

可见，这种compaction在合并的过程中，从上到下只需要部分文件参与，而不需要对所有文件执行compaction操作。另外，level compaction还有另外一个好处，对于很多‘只读最近写入数据’的业务来说，大部分读请求都会落到level 0，这样可以使用SSD作为上层level存储介质，进一步优化读。然而，这种compaction因为level层数太多导致compaction的次数明显增多，经过测试，发现这种compaction并没有对IO利用率有任何提升。

#### **Stripe Compaction 实现**

虽然原生的level compaction并不适用于HBase，但是这种compaction的思想却激发了HBaser的灵感，再结合之前提到的小region策略，就形成了本节的主角－stripe compaction。同level compaction相同，stripe compaction会将整个store中的文件按照Key划分为多个Range，在这里称为stripe，stripe的数量可以通过参数设定，相邻的stripe之间key不会重合。实际上在概念上来看这个stripe类似于sub-region的概念，即将一个大region切分成了很多小的sub-region。

随着数据写入，memstore执行flush之后形成hfile，这些hfile并不会马上写入对应的stripe，而是放到一个称为L0的地方，用户可以配置L0可以放置hfile的数量。一旦L0放置的文件数超过设定值，系统就会将这些hfile写入对应的stripe：首先读出hfile的KVs，再根据KV的key定位到具体的stripe，将该KV插入对应stripe的文件中即可，如下图所示。之前说过stripe就是一个个小的region，所以在stripe内部，依然会像正常region一样执行minor compaction和major compaction，可以预想到，stripe内部的major compaction并不会太多消耗系统资源。另外，数据读取也很简单，系统可以根据对应的Key查找到对应的stripe，然后在stripe内部执行查找，因为stripe内数据量相对很小，所以也会一定程度上提升数据查找性能。

![4](http://hbasefly.com/wp-content/uploads/2016/07/4-1.png)

![884122.png](file://c:/Users/hzfanxinxin/AppData/Local/YNote/data/hzfanxinxin@corp.netease.com/d851e63ac1d943bcab7c3f76db6fdbde/884122.png)

官方对stripe compaction进行了测试，给出的测试结果如下：

![5](http://hbasefly.com/wp-content/uploads/2016/07/5-1.png)

![532361.png](file://c:/Users/hzfanxinxin/AppData/Local/YNote/data/hzfanxinxin@corp.netease.com/d6bca64dbb9f4aaebc430c6801845c9c/532361.png)

上图主要测定了在不同的stripe数量以及不同的L0数量下的读写延迟对比情况，参考对照组可以看出，基本上任何配置下的读响应延迟都有所降低，而写响应延迟却有所升高。

![6](http://hbasefly.com/wp-content/uploads/2016/07/6-1.png)

![882584.png](file://c:/Users/hzfanxinxin/AppData/Local/YNote/data/hzfanxinxin@corp.netease.com/d2511efb2f8b4ea29edcd323fdf8bfb3/882584.png)

上图是默认配置和12-stripes配置下读写稳定性测试，其中两条蓝线分别表示默认情况下的读写延迟曲线，而两条红线表示strips情况下读写延迟曲线，可以明显看出来，无论读还是写，12-stripes配置下的稳定性都明显好于默认配置，不会出现明显的卡顿现象。

到此为止，我们能够看出来stripe compaction设计上的高明之处，同时通过实验数据也可以明显看出其在读写稳定性上的卓越表现。然而，和任何一种compaction机制一样，stripe compaction也有它特别擅长的业务场景，也有它并不擅长的业务场景。下面是两种stripe compaction比较擅长的业务场景：

\1. 大Region。小region没有必要切分为stripes，一旦切分，反而会带来额外的管理开销。一般默认如果region大小小于2G，就不适合使用stripe compaction。

\2. RowKey具有统一格式，stripe compaction要求所有数据按照Key进行切分，切分为多个stripe。如果rowkey不具有统一格式的话，无法进行切分。

------

上述几种策略都是根据不同的业务场景设置对应的文件选择策略，核心都是减少参与compaction的文件数，缩短整个compaction执行的时间，间接降低compaction的IO放大效应，减少对业务读写的延迟影响。然而，如果不对Compaction执行阶段的读写吞吐量进行限制的话也会引起短时间大量系统资源消耗，影响用户业务延迟。HBase社区也意识到了这个问题，也提出了一定的应对策略：

### **Limit Compaction Speed**

该优化方案通过感知Compaction的压力情况自动调节系统的Compaction吞吐量，在压力大的时候降低合并吞吐量，压力小的时候增加合并吞吐量。基本原理为：

\1. 在正常情况下，用户需要设置吞吐量下限参数“hbase.hstore.compaction.throughput.lower.bound”(默认10MB/sec) 和上限参数“hbase.hstore.compaction.throughput.higher.bound”(默认20MB/sec)，而hbase实际会工作在吞吐量为lower + (higer – lower) * ratio的情况下，其中ratio是一个取值范围在0到1的小数，它由当前store中待参与compation的file数量决定，数量越多，ratio越小，反之越大。

\2. 如果当前store中hfile的数量太多，并且超过了参数blockingFileCount，此时所有写请求就会阻塞等待compaction完成，这种场景下上述限制会自动失效。

截至目前，我们一直都在关注Compaction带来的IO放大效应，然而在某些情况下Compaction还会因为大量消耗带宽资源从而严重影响其他业务。为什么Compaction会大量消耗带宽资源呢？主要有两点原因：

\1. 正常请求下，compaction尤其是major compaction会将大量数据文件合并为一个大HFile，读出所有数据文件的KVs，然后重新排序之后写入另一个新建的文件。如果待合并文件都在本地，那么读就是本地读，不会出现垮网络的情况。但是因为数据文件都是三副本，因此写的时候就会垮网络执行，必然会消耗带宽资源。

\2. 原因1的前提是所有待合并文件都在本地的情况，那在有些场景下待合并文件有可能并不全在本地，即本地化率没有达到100%，比如执行过balance之后就会有很多文件并不在本地。这种情况下读文件的时候就会垮网络读，如果是major compaction，必然也会大量消耗带宽资源。

可以看出来，垮网络读是可以通过一定优化避免的，而垮网络写却是不可能避免的。因此优化Compaction带宽消耗，一方面需要提升本地化率（一个优化专题，在此不详细说明），减少垮网络读；另一方面，虽然垮网络写不可避免，但也可以通过控制手段使得资源消耗控制在一个限定范围，HBase在这方面也参考fb也做了一些工作：

### **Compaction BandWidth Limit**

原理其实和Limit Compaction Speed思路基本一致，它主要涉及两个参数：compactBwLimit和numOfFilesDisableCompactLimit，作用分别如下：

1. compactBwLimit：一次compaction的最大带宽使用量，如果compaction所使用的带宽高于该值，就会强制令其sleep一段时间

2. numOfFilesDisableCompactLimit：很显然，在写请求非常大的情况下，限制compaction带宽的使用量必然会导致HFile堆积，进而会影响到读请求响应延时。因此该值意义就很明显，一旦store中hfile数量超过该设定值，带宽限制就会失效。