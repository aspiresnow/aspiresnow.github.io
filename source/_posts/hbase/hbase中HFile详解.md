---
title: hbase中HFile详解
date: 2017-09-14 00:10:14
tags:
- hbase
categories:
- 大数据
---

# hbase中HFile详解

HBase中KeyValue数据的存储格式，是Hadoop的二进制格式文件，有固定的结构。实际上StoreFile就是对HFile做了轻量级包装，即StoreFile底层就是HFile

## HFile的物理结构

**HFile逻辑结构**

HFile V2的逻辑结构如下图所示：

![1](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile1.jpg?raw=true)

文件主要分为四个部分：Scanned block section，Non-scanned block section，Opening-time data section和Trailer。

Scanned block section：顾名思义，表示顺序扫描HFile时所有的数据块将会被读取，包括Leaf Index Block和Bloom Block。

Non-scanned block section：表示在HFile顺序扫描的时候数据不会被读取，主要包括Meta Block和Intermediate Level Data Index Blocks两部分。

Load-on-open-section：这部分数据在HBase的region server启动时，需要加载到内存中。包括FileInfo、Bloom filter block、data block index和meta block index。

Trailer：这部分主要记录了HFile的基本信息、各个部分的偏移值和寻址信息。

**HFile物理结构**

**![2](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile2.jpg?raw=true)**

如上图所示， HFile会被切分为多个大小相等的block块，每个block的大小可以在创建表列簇的时候通过参数blocksize ＝> ‘65535’进行指定，默认为64k，**大号的Block有利于顺序Scan，小号Block利于随机查询**，因而需要权衡。而且所有block块都拥有相同的数据结构，如图左侧所示，HBase将block块抽象为一个统一的HFileBlock。HFileBlock支持两种类型，一种类型不支持checksum，一种不支持。为方便讲解，下图选用不支持checksum的HFileBlock内部结构：

![3](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile3.jpg?raw=true)

上图所示HFileBlock主要包括两部分：BlockHeader和BlockData。其中BlockHeader主要存储block元数据，BlockData用来存储具体数据。block元数据中最核心的字段是BlockType字段，用来标示该block块的类型，HBase中定义了8种BlockType，每种BlockType对应的block都存储不同的数据内容，有的存储用户数据，有的存储索引数据，有的存储meta元数据。对于任意一种类型的HFileBlock，都拥有相同结构的BlockHeader，但是BlockData结构却不相同。下面通过一张表简单罗列最核心的几种BlockType，下文会详细针对每种BlockType进行详细的讲解：

![4](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile4.jpg?raw=true)

**HFile中Block块解析**

上文从HFile的层面将文件切分成了多种类型的block，接下来针对几种重要block进行详细的介绍，因为篇幅的原因，索引相关的block不会在本文进行介绍，接下来会写一篇单独的文章对其进行分析和讲解。首先会介绍记录HFile基本信息的TrailerBlock，再介绍用户数据的实际存储块DataBlock，最后简单介绍布隆过滤器相关的block。

**Trailer Block **

主要记录了HFile的基本信息、各个部分的偏移值和寻址信息，下图为Trailer内存和磁盘中的数据结构，其中只显示了部分核心字段：

![5](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile5.jpg?raw=true)

HFile在读取的时候首先会解析Trailer Block并加载到内存，然后再进一步加载LoadOnOpen区的数据，具体步骤如下：

1. 首先加载version版本信息，HBase中version包含majorVersion和minorVersion两部分，前者决定了HFile的主版本： V1、V2 还是V3；后者在主版本确定的基础上决定是否支持一些微小修正，比如是否支持checksum等。不同的版本决定了使用不同的Reader对象对HFile进行读取解析
2. 根据Version信息获取trailer的长度（不同version的trailer长度不同），再根据trailer长度加载整个HFileTrailer Block
3. 最后加载load-on-open部分到内存中，起始偏移地址是trailer中的LoadOnOpenDataOffset字段，load-on-open部分的结束偏移量为HFile长度减去Trailer长度，load-on-open部分主要包括索引树的根节点以及FileInfo两个重要模块，FileInfo是固定长度的块，它纪录了文件的一些Meta信息，例如：AVG_KEY_LEN, AVG_VALUE_LEN, LAST_KEY, COMPARATOR, MAX_SEQ_ID_KEY等；索引树根节点放到下一篇文章进行介绍。

**Data Block**

DataBlock是HBase中数据存储的最小单元，默认大小为64k。Data 块是HBase I/O的基本单元，访问的时候会加载整个块到内存中，查找数据时顺序的遍历该块中的keyValue对。

**如果业务请求以Get请求为主，可以考虑将块大小设置较小；如果以Scan请求为主，可以将块大小调大；默认的64K块大小是在Scan和Get之间取得的一个平衡。**

通常对Data块采用压缩方式存储，压缩之后可以大大减少网络IO和磁盘IO，随之而来的开销当然是需要花费cpu进行压缩和解压缩,cpu往往比磁盘传输要快,支持两种压缩方式：Gzip，Lzo，Snappy(最优)

DataBlock中主要存储用户的KeyValue数据（KeyValue后面一般会跟一个timestamp，图中未标出），而KeyValue结构是HBase存储的核心，每个数据都是以KeyValue结构在HBase中进行存储。KeyValue结构在内存和磁盘中可以表示为：

![6](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile6.jpg?raw=true)

每个KeyValue都由4个部分构成，分别为key length，value length，key和value。其中key value和value length是两个固定长度的数值，而key是一个复杂的结构，首先是rowkey的长度，接着是rowkey，然后是ColumnFamily的长度，再是ColumnFamily，最后是时间戳和KeyType（keytype有四种类型，分别是Put、Delete、 DeleteColumn和DeleteFamily），value就没有那么复杂，就是一串纯粹的二进制数据。

**BloomFilter Meta Block & Bloom Block**

BloomFilter对于HBase的随机读性能至关重要，对于get操作以及部分scan操作可以剔除掉不会用到的HFile文件，减少实际IO次数，提高随机读性能。在此简单地介绍一下Bloom Filter的工作原理，Bloom Filter使用位数组来实现过滤，初始状态下位数组每一位都为0，如下图所示：

![7](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile7.jpg?raw=true)

假如此时有一个集合S = {x1, x2, … xn}，Bloom Filter使用k个独立的hash函数，分别将集合中的每一个元素映射到｛1,…,m｝的范围。对于任何一个元素，被映射到的数字作为对应的位数组的索引，该位会被置为1。比如元素x1被hash函数映射到数字8，那么位数组的第8位就会被置为1。下图中集合S只有两个元素x和y，分别被3个hash函数进行映射，映射到的位置分别为（0，2，6）和（4，7，10），对应的位会被置为1:

![8](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile8.jpg?raw=true)

现在假如要判断另一个元素是否是在此集合中，只需要被这3个hash函数进行映射，查看对应的位置是否有0存在，如果有的话，表示此元素肯定不存在于这个集合，否则有可能存在。下图所示就表示z肯定不在集合｛x，y｝中：

![9](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile9.jpg?raw=true)

HBase中每个HFile都有对应的位数组，KeyValue在写入HFile时会先经过几个hash函数的映射，映射后将对应的数组位改为1，get请求进来之后再进行hash映射，如果在对应数组位上存在0，说明该get请求查询的数据不在该HFile中。

HFile中的位数组就是上述Bloom Block中存储的值，可以想象，一个HFile文件越大，里面存储的KeyValue值越多，位数组就会相应越大。一旦太大就不适合直接加载到内存了，因此HFile V2在设计上将位数组进行了拆分，拆成了多个独立的位数组（根据Key进行拆分，一部分连续的Key使用一个位数组）。这样一个HFile中就会包含多个位数组，根据Key进行查询，首先会定位到具体的某个位数组，只需要加载此位数组到内存进行过滤即可，减少了内存开支。

在结构上每个位数组对应HFile中一个Bloom Block，为了方便根据Key定位具体需要加载哪个位数组，HFile V2又设计了对应的索引Bloom Index Block，对应的内存和逻辑结构图如下：

![10](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile10.jpg?raw=true)

Bloom Index Block结构中totalByteSize表示位数组的bit数，numChunks表示Bloom Block的个数，hashCount表示hash函数的个数，hashType表示hash函数的类型，totalKeyCount表示bloom filter当前已经包含的key的数目，totalMaxKeys表示bloom filter当前最多包含的key的数目, Bloom Index Entry对应每一个bloom filter block的索引条目，作为索引分别指向’scanned block section’部分的Bloom Block，Bloom Block中就存储了对应的位数组。

Bloom Index Entry的结构见上图左边所示，BlockOffset表示对应Bloom Block在HFile中的偏移量，FirstKey表示对应BloomBlock的第一个Key。根据上文所说，一次get请求进来，首先会根据key在所有的索引条目中进行二分查找，查找到对应的Bloom Index Entry，就可以定位到该key对应的位数组，加载到内存进行过滤判断。

**总结**

这篇小文首先从宏观的层面对HFile的逻辑结构和物理存储结构进行了讲解，并且将HFile从逻辑上分解为各种类型的Block，再接着从微观的视角分别对Trailer Block、Data Block在结构上进行了解析：通过对trailer block的解析，可以获取hfile的版本以及hfile中其他几个部分的偏移量，在读取的时候可以直接通过偏移量对其进行加载；而对data block的解析可以知道用户数据在hdfs中是如何实际存储的；最后通过介绍Bloom Filter的工作原理以及相关的Block块了解HFile中Bloom Filter的存储结构。接下来会以本文为基础，再写一篇文章分析HFile中索引块的结构以及相应的索引机制。

## HFile索引机制

**HFile索引结构解析**

HFile中索引结构根据索引层级的不同分为两种：single-level和mutil-level，前者表示单层索引，后者表示多级索引，一般为两级或三级。HFile V1版本中只有single-level一种索引结构，V2版本中引入多级索引。之所以引入多级索引，是因为随着HFile文件越来越大，Data Block越来越多，索引数据也越来越大，已经无法全部加载到内存中（V1版本中一个Region Server的索引数据加载到内存会占用几乎6G空间），多级索引可以只加载部分索引，降低内存使用空间。Bloom Filter内存使用问题是促使V1版本升级到V2版本的一个原因，再加上这个原因，这两个原因就是V1版本升级到V2版本最重要的两个因素。

V2版本Index Block有两类：Root Index Block和NonRoot Index Block，其中NonRoot Index Block又分为Intermediate Index Block和Leaf Index Block两种。HFile中索引结构类似于一棵树，Root Index Block表示索引数根节点，Intermediate Index Block表示中间节点，Leaf Index block表示叶子节点，叶子节点直接指向实际数据块。

HFile中除了Data Block需要索引之外，上一篇文章提到过Bloom Block也需要索引，索引结构实际上就是采用了single-level结构，文中Bloom Index Block就是一种Root Index Block。

对于Data Block，由于HFile刚开始数据量较小，索引采用single-level结构，只有Root Index一层索引，直接指向数据块。当数据量慢慢变大，Root Index Block满了之后，索引就会变为mutil-level结构，由一层索引变为两层，根节点指向叶子节点，叶子节点指向实际数据块。如果数据量再变大，索引层级就会变为三层。

下面就针对Root index Block和NonRoot index Block两种结构进行解析，因为Root Index Block已经在上面一篇文章中分析过，此处简单带过，重点介绍NonRoot Index Block结构（InterMediate Index Block和Ieaf Index Block在内存和磁盘中存储格式相同，都为NonRoot Index Block格式）。

**Root Index Block**

Root Index Block表示索引树根节点索引块，可以作为bloom的直接索引，也可以作为data索引的根索引。而且对于single-level和mutil-level两种索引结构对应的Root Index Block略有不同，本文以mutil-level索引结构为例进行分析（single-level索引结构是mutual-level的一种简化场景），在内存和磁盘中的格式如下图所示：

![22](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile11.jpg?raw=true)

其中Index Entry表示具体的索引对象，每个索引对象由3个字段组成，Block Offset表示索引指向数据块的偏移量，BlockDataSize表示索引指向数据块在磁盘上的大小，BlockKey表示索引指向数据块中的第一个key。除此之外，还有另外3个字段用来记录MidKey的相关信息，MidKey表示HFile所有Data Block中中间的一个Data Block，用于在对HFile进行split操作时，快速定位HFile的中间位置。需要注意的是single-level索引结构和mutil-level结构相比，就只缺少MidKey这三个字段。

Root Index Block会在HFile解析的时候直接加载到内存中，此处需要注意在Trailer Block中有一个字段为dataIndexCount，就表示此处Index Entry的个数。因为Index Entry并不定长，只有知道Entry的个数才能正确的将所有Index Entry加载到内存。

**NonRoot Index Block**

当HFile中Data Block越来越多，single-level结构的索引已经不足以支撑所有数据都加载到内存，需要分化为mutil-level结构。mutil-level结构中NonRoot Index Block作为中间层节点或者叶子节点存在，无论是中间节点还是叶子节点，其都拥有相同的结构，如下图所示：

![23](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile12.jpg?raw=true)

和Root Index Block相同，NonRoot Index Block中最核心的字段也是Index Entry，用于指向叶子节点块或者数据块。不同的是，NonRoot Index Block结构中增加了block块的内部索引entry Offset字段，entry Offset表示index Entry在该block中的相对偏移量（相对于第一个index Entry)，用于实现block内的二分查找。所有非根节点索引块，包括Intermediate index block和leaf index block，在其内部定位一个key的具体索引并不是通过遍历实现，而是使用二分查找算法，这样可以更加高效快速地定位到待查找key。

**HFile数据完整索引流程**

了解了HFile中数据索引块的两种结构之后，就来看看如何使用这些索引数据块进行数据的高效检索。整个索引体系类似于MySQL的B+树结构，但是又有所不同，比B+树简单，并没有复杂的分裂操作。具体见下图所示：

![24](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile13.jpg?raw=true)

图中上面三层为索引层，在数据量不大的时候只有最上面一层，数据量大了之后开始分裂为多层，最多三层，如图所示。最下面一层为数据层，存储用户的实际keyvalue数据。这个索引树结构类似于InnoSQL的聚集索引，只是HBase并没有辅助索引的概念。

图中红线表示一次查询的索引过程（HBase中相关类为HFileBlockIndex和HFileReaderV2），基本流程可以表示为：

1. 用户输入rowkey为fb，在root index block中通过二分查找定位到fb在’a’和’m’之间，因此需要访问索引’a’指向的中间节点。因为root index block常驻内存，所以这个过程很快。
2. 将索引’a’指向的中间节点索引块加载到内存，然后通过二分查找定位到fb在index ‘d’和’h’之间，接下来访问索引’d’指向的叶子节点。
3. 同理，将索引’d’指向的中间节点索引块加载到内存，一样通过二分查找定位找到fb在index ‘f’和’g’之间，最后需要访问索引’f’指向的数据块节点。
4. 将索引’f’指向的数据块加载到内存，通过遍历的方式找到对应的keyvalue。

上述流程中因为中间节点、叶子节点和数据块都需要加载到内存，所以io次数正常为3次。但是实际上HBase为block提供了缓存机制，可以将频繁使用的block缓存在内存中，可以进一步加快实际读取过程。所以，在HBase中，通常一次随机读请求最多会产生3次io，如果数据量小（只有一层索引），数据已经缓存到了内存，就不会产生io。

**索引块分裂**

上文中已经提到，当数据量少、文件小的时候，只需要一个root index block就可以完成索引，即索引树只有一层。当数据不断写入，文件变大之后，索引数据也会相应变大，索引结构就会由single-level变为mulit-level，期间涉及到索引块的写入和分裂，本节来关注一下数据写入是如何引起索引块分裂的。

如果大家之前看过HBase系列另一篇博文[《HBase数据写入之Memstore Flush》](http://hbasefly.com/2016/03/23/hbase-memstore-flush/)，可以知道memstore flush主要分为3个阶段，第一个阶段会讲memstore中的keyvalue数据snapshot，第二阶段再将这部分数据flush的HFile，并生成在临时目录，第三阶段将临时文件移动到指定的ColumnFamily目录下。很显然，第二阶段将keyvalue数据flush到HFile将会是关注的重点（flush相关代码在DefaultStoreFlusher类中）。整个flush阶段又可以分为两阶段：

1. append阶段：memstore中keyvalue首先会写入到HFile中数据块

2. finalize阶段：修改HFlie中meta元数据块，索引数据块以及Trailer数据块等

**append流程**

具体keyvalue数据的append以及finalize过程在HFileWriterV2文件中，其中append流程可以大体表征为：

![25](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile14.jpg?raw=true)

a. 预检查：检查key的大小是否大于前一个key，如果大于则不符合HBase顺序排列的原理，抛出异常；检查value是否是null，如果为null也抛出异常

b. block是否写满：检查当前Data Block是否已经写满，如果没有写满就直接写入keyvalue；否则就需要执行数据块落盘以及索引块修改操作；

c. 数据落盘并修改索引：如果DataBlock写满，首先将block块写入流；再生成一个leaf index entry，写入leaf Index block；再检查该leaf index block是否已经写满需要落盘，如果已经写满，就将该leaf index block写入到输出流，并且为索引树根节点root index block新增一个索引，指向叶子节点(second-level index)

d. 生成一个新的block：重新reset输出流，初始化startOffset为-1

e. 写入keyvalue：将keyvalue以流的方式写入输出流，同时需要写入memstoreTS；除此之外，如果该key是当前block的第一个key，需要赋值给变量firstKeyInBlock

**finalize阶段**

memstore中所有keyvalue都经过append阶段输出到HFile后，会执行一次finalize过程，主要更新HFile中meta元数据块、索引数据块以及Trailer数据块，其中对索引数据块的更新是我们关心的重点，此处详细解析，上述append流程中c步骤’数据落盘并修改索引’会使得root index block不断增多，当增大到一定程度之后就需要分裂，分裂示意图如下图所示：

![26](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/hbase/hfile15.jpg?raw=true)

上图所示，分裂前索引结构为second-level结构，图中没有画出Data Blocks，根节点索引指向叶子节点索引块。finalize阶段系统会对Root Index Block进行大小检查，如果大小大于规定的大小就需要进行分裂，图中分裂过程实际上就是将原来的Root Index Block块分割成4块，每块独立形成中间节点InterMediate Index Block，系统再重新生成一个Root Index Block（图中红色部分），分别指向分割形成的4个interMediate Index Block。此时索引结构就变成了third-level结构。

**总结**

这篇文章是HFile结构解析的第二篇文章，主要集中介绍HFile中的数据索引块。首先分Root Index Block和NonRoot Index Block两部分对HFile中索引块进行了解析，紧接着基于此介绍了HBase如何使用索引对数据进行检索，最后结合Memstore Flush的相关知识分析了keyvalue数据写入的过程中索引块的分裂过程。希望通过这两篇文章的介绍，能够对HBase中数据存储文件HFile有一个更加全面深入的认识。

## 怎样从一系列的HFile中找到某个rowkey?

​     如果创建表时，指定了booleamFilter，那么就根据booleamFilter快速的判断该rowkey是否在这个HFile中。

​     如果没有定义booleamFilter，hbase在查找先会根据时间戳或者查询列的信息来进行过滤，过滤掉那些肯定不含有所需数据的storefile或者memstore，尽量把我们的查询目标范围缩小。

​     尽管缩小了，但仍可能会有多个文件需要扫描的。storefile的内部有序的，但是各个storefile之间并不是有序的。storefile的rowkey的范围很有可能有交叉。所以查询数据的过程也不可能是对storefile的顺序查找。
hbase会首先查看每个storefile的最小的rowkey，然后按照从小到大的顺序进行排序，结果放到一个队列中，排序的算法就是按照hbase的三维顺序，按照rowkey，column，ts进行排序，rowkey和column是升序，而ts是降序。
实际上并不是所有满足时间戳和列过滤的文件都会加到这个队列中，hbase会首先对各个storefile中的数据进行探测，只会扫描扫描那些存在比当前查询的rowkey大的记录的storefile。
​    下面开始查询数据，整个过程用到了类似归并排序的算法，首先通过poll取出队列的头storefile，会从storefile读取一条记录返回；接下来呢，该storefile的下条记录并不一定是查询结果的下一条记录，因为队列的比较顺序是比较的每个storefile的第一条符合要求的rowkey。所以，hbase会继续从队列中剩下的storefile取第一条记录，把该记录与头storefile的第二条记录做比较，如果前者大，那么返回头storefile的第二条记录；如果后者大，则会把头storefile放回队列重新排序，在重新取队列的头storefile。然后重复上面的整个过程，直到找到key所在的HFile。范围缩小到该HFile后，就根据上面介绍的索引查找定位到块，快速的找到对应的记录。