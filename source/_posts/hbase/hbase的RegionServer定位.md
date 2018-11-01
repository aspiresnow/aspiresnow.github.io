---
title: hbase的RegionServer定位
date: 2017-09-13 23:48:56
tags:
- hbase
categories:
- 大数据
---

# hbase的RegionServer定位 

### Hbase 使用三层类似B+树的结构来保存region位置：

1. 第一层是保存zookeeper里面的文件，它持有root region的位置。
2. 第二层root region是.META.表的第一个region其中保存了.META.z表其它region的位置。通过root region，我们就可以访问.META.表的数据。
3. .META.是第三层，它是一个特殊的表，保存了Hbase中所有数据表的region 位置信息。

### -ROOT- 和 .META. 表

- -ROOT-表：记录了.META.表对应的HRS信息，**-ROOT-表永远不会被split，只有一个Region**。

- ZK中保存了-ROOT-表对应的HRS位置，默认的路径是 "/hbase/root-region-server"

- .META.表：记录了用户表对应的HRS信息，由于.META.表太大，会被切分成多个HR，存储在不同的HRS中。

- 读取数据的流程：ZooKeeper --> -ROOT-(单个Region) --> .META.(多个) --> HRS --> 用户Table。3次网络操作

  读请求处理过程(无需借助HMaster)

- client会将查询过的位置信息保存缓存起来，缓存不会主动失效，因此如果client上的缓存全部失效，则需要进行6次网络来回，才能定位到正确的region(其中三次用来发现缓存失效，另外三次用来获取位置信息)。



 在HBase中，大部分的操作都是在RegionServer完成的，Client端想要插入，删除，查询数据都需要先找到相应的RegionServer。什么叫相应的RegionServer？就是管理你要操作的那个Region的RegionServer。Client本身并不知道哪个RegionServer管理哪个Region，那么它是如何找到相应的RegionServer的？本文就是在研究源码的基础上揭秘这个过程。

在前面的文章“HBase存储架构”中我们已经讨论了HBase基本的存储架构。在此基础上我们引入两个特殊的概念：-ROOT-和.META.。这是什么？它们是HBase的两张内置表，从存储结构和操作方法的角度来说，它们和其他HBase的表没有任何区别，你可以认为这就是两张普通的表，对于普通表的操作对它们都适用。它们与众不同的地方是HBase用它们来存贮一个重要的系统信息——Region的分布情况以及每个Region的详细信息。

好了，既然我们前面说到**-ROOT-**和**.META.**可以被看作是两张普通的表，那么它们和其他表一样就应该有自己的表结构。没错，它们有自己的表结构，并且这两张表的表结构是相同的，在分析源码之后我将这个表结构大致的画了出来：

**-ROOT-和.META.表结构**

![-ROOT-和.META.表结构](http://dl.iteye.com/upload/picture/pic/124503/5120c136-5b0e-3d02-9ebc-f7ed08800532.jpg)

我们来仔细分析一下这个结构，每条Row记录了一个Region的信息。

首先是RowKey，RowKey由三部分组成：TableName, StartKey 和 TimeStamp。RowKey存储的内容我们又称之为Region的Name。哦，还记得吗？我们在前面的文章中提到的，用来存放Region的文件夹的名字是RegionName的Hash值，因为RegionName可能包含某些非法字符。现在你应该知道为什么RegionName会包含非法字符了吧，因为StartKey是被允许包含任何值的。将组成RowKey的三个部分用逗号连接就构成了整个RowKey，这里TimeStamp使用十进制的数字字符串来表示的。这里有一个RowKey的例子： 

Java代码  [![收藏代码](http://greatwqs.iteye.com/images/icon_star.png)]()

1. Table1,RK10000,12345678  

 然后是表中最主要的Family：info，info里面包含三个Column：regioninfo, server, serverstartcode。其中regioninfo就是Region的详细信息，包括StartKey, EndKey 以及每个Family的信息等等。server存储的就是管理这个Region的RegionServer的地址。

所以当Region被拆分、合并或者重新分配的时候，都需要来修改这张表的内容。

到目前为止我们已经学习了必须的背景知识，下面我们要正式开始介绍Client端寻找RegionServer的整个过程。我打算用一个假想的例子来学习这个过程，因此我先构建了假想的-ROOT-表和.META.表。

我们先来看.META.表，假设HBase中只有两张用户表：Table1和Table2，Table1非常大，被划分成了很多Region，因此在.META.表中有很多条Row用来记录这些Region。而Table2很小，只是被划分成了两个Region，因此在.META.中只有两条Row用来记录。这个表的内容看上去是这个样子的： 

**.META.行记录结构**

![.META.行记录结构](http://dl.iteye.com/upload/picture/pic/124499/951c379d-cc22-3ccd-a377-7a24d09ed479.jpg)

现在假设我们要从Table2里面插寻一条RowKey是RK10000的数据。那么我们应该遵循以下步骤：

\1. 从.META.表里面查询哪个Region包含这条数据。

\2. 获取管理这个Region的RegionServer地址。

\3. 连接这个RegionServer, 查到这条数据。

好，我们先来第一步。问题是.META.也是一张普通的表，我们需要先知道哪个RegionServer管理了.META.表，怎么办？有一个方法，我们把管理.META.表的RegionServer的地址放到ZooKeeper上面不久行了，这样大家都知道了谁在管理.META.。

貌似问题解决了，但对于这个例子我们遇到了一个新问题。因为Table1实在太大了，它的Region实在太多了，.META.为了存储这些Region信息，花费了大量的空间，自己也需要划分成多个Region。这就意味着可能有多个RegionServer在管理.META.。怎么办？在ZooKeeper里面存储所有管理.META.的RegionServer地址让Client自己去遍历？HBase并不是这么做的。

HBase的做法是用另外一个表来记录.META.的Region信息，就和.META.记录用户表的Region信息一模一样。这个表就是-ROOT-表。这也解释了为什么-ROOT-和.META.拥有相同的表结构，因为他们的原理是一模一样的。

假设.META.表被分成了两个Region，那么-ROOT-的内容看上去大概是这个样子的：

**-ROOT-行记录结构**

![-ROOT-行记录结构](http://dl.iteye.com/upload/picture/pic/124501/d1f2e0e1-52a2-3946-8a0d-a6c7bda41cff.jpg)

这么一来Client端就需要先去访问-ROOT-表。所以需要知道管理-ROOT-表的RegionServer的地址。这个地址被存在ZooKeeper中。默认的路径是： 

Java代码  [![收藏代码](http://greatwqs.iteye.com/images/icon_star.png)]()

1. /hbase/root-region-server  

 等等，如果-ROOT-表太大了，要被分成多个Region怎么办？嘿嘿，HBase认为-ROOT-表不会大到那个程度，因此-ROOT-只会有一个Region，这个Region的信息也是被存在HBase内部的。 

现在让我们从头来过，我们要查询Table2中RowKey是RK10000的数据。整个路由过程的主要代码在org.apache.hadoop.hbase.client.HConnectionManager.TableServers中： 

Java代码  [![收藏代码](http://greatwqs.iteye.com/images/icon_star.png)]()

1. private HRegionLocation locateRegion(final byte[] tableName,  
2. ​        final byte[] row, boolean useCache) throws IOException {  
3. ​    if (tableName == null || tableName.length == 0) {  
4. ​        throw new IllegalArgumentException("table name cannot be null or zero length");  
5. ​    }  
6. ​    if (Bytes.equals(tableName, ROOT_TABLE_NAME)) {  
7. ​        synchronized (rootRegionLock) {  
8. ​            // This block guards against two threads trying to find the root  
9. ​            // region at the same time. One will go do the find while the  
10. ​            // second waits. The second thread will not do find.  
11. ​            if (!useCache || rootRegionLocation == null) {  
12. ​                this.rootRegionLocation = locateRootRegion();  
13. ​            }  
14. ​            return this.rootRegionLocation;  
15. ​        }  
16. ​    } else if (Bytes.equals(tableName, META_TABLE_NAME)) {  
17. ​        return locateRegionInMeta(ROOT_TABLE_NAME, tableName, row, useCache, metaRegionLock);  
18. ​    } else {  
19. ​        // Region not in the cache – have to go to the meta RS  
20. ​        return locateRegionInMeta(META_TABLE_NAME, tableName, row, useCache, userRegionLock);  
21. ​    }  
22. }  

 这是一个递归调用的过程： 

Java代码 

1. 获取Table2，RowKey为RK10000的RegionServer => 获取.META.，RowKey为Table2,RK10000, 99999999999999的RegionServer => 获取-ROOT-，RowKey为.META.,Table2,RK10000,99999999999999,99999999999999的RegionServer => 获取-ROOT-的RegionServer => 从ZooKeeper得到-ROOT-的RegionServer => 从-ROOT-表中查到RowKey最接近（小于） .META.,Table2,RK10000,99999999999999,99999999999999的一条Row，并得到.META.的RegionServer => 从.META.表中查到RowKey最接近（小于）Table2,RK10000, 99999999999999的一条Row，并得到Table2的RegionServer => 从Table2中查到RK10000的Row  

 到此为止Client完成了路由RegionServer的整个过程，在整个过程中使用了添加“99999999999999”后缀并查找最接近（小于）RowKey的方法。对于这个方法大家可以仔细揣摩一下，并不是很难理解。

最后要提醒大家注意两件事情：

\1. 在整个路由过程中并没有涉及到MasterServer，也就是说HBase日常的数据操作并不需要MasterServer，不会造成MasterServer的负担。

\2. Client端并不会每次数据操作都做这整个路由过程，很多数据都会被Cache起来。至于如何Cache，则不在本文的讨论范围之内。

原