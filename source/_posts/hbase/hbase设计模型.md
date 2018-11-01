---
title: hbase数据模型
date: 2017-09-07 21:58:46
tags:
- hbase
categories:
- 大数据
---

# Hbase设计模型

## HBase基本组件

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/hbase3.jpg)

- Client

  - 使用HBase RPC机制与HMaster和HRegionServer进行通信
  - Client与HMaster进行通信进行管理类操作
  - Client与HRegionServer进行数据读写类操作
  - Client访问ZK获取_ROOT_表位置，获取集群的属性
  - 缓存Region的位置信息来加快对HBase的访问


- HMaster

  HBase中可以启动多个HMaster，通过Zookeeper保证总有一个Active Master运行。主要负责Table和Region的管理工作：

  - 管理用户对Table的增删改操作
  - 负责Region Split后新Region的分布,管理HRS的负载均衡
  - 发现失效的HRS重新分配其上的HR
  - Client对HBase数据的操作并不需要HMaster参与，仅仅维护者Table和HR的元数据信息，负载很低

- HRegion Server

  ![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/hbase4.jpg)

  - 负责响应client的I\O请求，存储hbase的数据文件，查询并返回数据
  - HRS上存储多个Region
  - HRS负责切分Region，当一个Region中的文件大小超过某个阈值(hbase.hregion.max.filesize)时，开始分裂成两个新Region，并由HMaster实现负载均衡，将新的分配到其他的HRS，同时删除旧Region
  - 不要给RegionServer太大堆内存，堆内存在使用过程中会产生大量碎片，一旦full gc时间过长，master会判定slave进程已经死掉，并将其从slave工作列表中移除

- ZooKeeper

  - 通过选举，保证任何时候，集群中只有一个HMaster。ZK的引入使得HMaster不再是单点故障。
  - HBase依赖ZooKeeper提供消息通信机制，避免了master和region服务器之间的心跳信息的传递。HMaster与HRS启动时会向ZK注册，并定时向ZK发送心跳。实时监控HRS的状态，将HRS上线和下线信息实时通知给HMaster。
  - **Zookeeper存储了-ROOT-表地址(所有Region的寻址入口)、HMaster地址**。
  - 存储Hbase的schema,包括有哪些table，每个table有哪些column family


## 存储模型

- Namespace
  - 命名空间是对表的逻辑分组，同一个空间下的表有类似的用途
  - 配额管理：制一个namespace可以使用的资源，资源包括region和table等
  - 命名空间安全管理：提供了另一个层面的多租户安全管理
  - Region服务器组：一个命名空间或一张表，可以被固定到一组regionservers上，从而保证了数据隔离性
  - hbase内部有两个预定义的命名空间 hbase(系统表命名空间)和default(未指定命名空间的表自动归类)
  - create_namespace 'ns'              create 'ns:tableName','f1'
- Table
  - 在hbase中，每张表在hbase的根目录下都有自己的目录，在表目录下有一个.tableinfo的文件存储表的结构信息
  - 一张表初始时只有一个Region，向Region插入数据时，会检查region的大小，确保其不会超过配置的最大值，如果超过了限制，系统会在`中间键`(midlle key)处将这个region拆分成两个大致相等的region，通过HMaster负责均衡分布到其他ReginServer上
  - 一个Region只会存储一张表的数据


- Region

  - 在表目录下存在每个Region的目录，Region目录下有个.regininfo文件存储region的信息

  - Region中的数据**按照Row Key字典顺序排列**

  - HBase自动把表水平（按Row）划分成多个区域(region)，每个region会保存一个表里面某段连续的数据

  - 每个表一开始只有一个region，随着数据不断插入表，region不断增大，当增大到一个阀值的时候，region就会等分会两个新的region；当table中的行不断增多，就会有越来越多的region。这样一张完整的表被保存在多个Region 上。拆分的同时会更新.META.表。

  - Region是HBase中分布式存储和负载均衡的最小单元（默认256M）。最小单元表示不同的Region可以分布在不同的HRegionServer上。但一个Region不会拆分到多个server上。

  - 一个Region有多个Store，一个Store包含一个MemStore(内存数据)和多个StoreFile(磁盘数据)， 每个StoreFile保存一个ColumnFamily，其中StoreFile存储在HDFS上，对应为HFile文件。

    ![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/hbase5.jpg)

    ​

- Store

  - 一个Region包含多个Stroe，每个Store保存一个Column Family的所有数据
  - 一个列族可以有多个StoreFile，但一个StoreFile只能存储一个列族的数据

  - 一个Store包含一个位于内存中的MemStore和多个位于硬盘的StoreFile

- MemStore

  - MemStore处于内存中，默认64MB，用于内存级别接收client端的操作
  - 一旦KeyValue的写入WAL中，数据就会放到MemStore中，如果MemStore写满会刷写到磁盘，生成一个新的StoreFile
  - 客户端检索数据时，先在MemStore找，找不到再找StoreFile。

- HLog(WAL)日志

     由于MemStore中的数据是存储在内存中的，一旦系统出错或者宕机，一旦HRS意外退出，**MemStore**中的内存数据就会丢失，为防止这种情况，引入WAL，写MemStore之前先写入日志，Memstore刷写成一个StoreFile后再删除日志。

- StoreFile

  - 对HFile的简单封装，实际的物理存储文件


## 数据模型

![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/hbase6.jpg)

- Rowkey

  - Row key按照字典序存储，要充分考虑排序存储这个特性，将经常一起读取的行存储放到一起(位置相关性)。

  - 字典序对int排序的结果是1,10,100,11,2,20,21,…,9。要保持整形的自然序，行键必须用0作左填充。

  - 行的一次读写是原子操作 (不论一次读写多少列)，使得多用户不能并发对同一个行进行更新操作。

- Column Family(列族)

  - 建表时手动指定，包含一个或者多个列

  - 列族中的数据都是以二进制的形式保存在hdfs上，没有数据类型

  - 不能重命名列族，通常做是法先创建新的列族，然后将数据复制过去，最后再删除旧的列族。

  - 每个列族存储在HDFS上的一个单独文件中

  - 访问控制、磁盘和内存的使用统计都是在列族层面进行的

- Column

  - 列族下可以添加任意多个列
  - 列名在添加数据时动态添加，无需在建表时指定。没有具体的数据类型

- TimeStamp

  - 默认值使用系统时间戳，如果应用程序要避免数据时间戳冲突，就必须自己生成具有唯一性的时间戳。
  - 为了避免数据存在过多版本造成的的管理 (包括存贮和索引)负担，HBase提供了两种数据版本回收方式。一是保存数据的最后n个版本，二是保存最近一段时间内的版本（即设置HColumnDescriptor.setTimeToLive(); 比如最近七天）。用户可以针对每个列族单独进行设置。

- Cell

  - HBase中通过" tableName + RowKey + ColumnKey "确定的唯一存贮单元称为Cell。
  - 每个Cell都保存着同一份数据的多个版本，每个版本通过时间戳Time Stamp来索引。
  - 每个cell中，不同版本的数据按照时间倒序排列，即最新的数据排在最前面。
  - Cell的每个值通过4个键tableName + RowKey + ColumnKey + Timestamp => value唯一确定一个KeyValue

- KeyValue

  ![image](https://image-1257941127.cos.ap-beijing.myqcloud.com/hbase7.jpg)

  - KeyValue就是一个简单的byte数组，以两个分别表示键长度和值长度的定长数字开始。通过这两个值可以忽略键直接访问值
  - 每一个KeyValue实例包含了行键、列键和时间戳索引和值 (Table,RowKey,Family,Column,Timestamp)—>value，(Timestamp是一个 64 位Java的long型)，数据按照一个四维坐标系统来组织：行键、列族、列限定符和时间版本
  - 多个KeyValue之间的存储是有序的
  - KeyValue所有可能存在的形式 Put、Delete、DeleteColumn、DeleteFamily




