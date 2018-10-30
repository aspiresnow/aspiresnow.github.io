---
title: hbase认识与安装配置
date: 2017-09-06 07:20:10
tags:
- hbase
categories:
- 大数据
---
# hbase认识与安装配置

## 认识

HBase是一种构建在HDFS之上提供高可靠性、高性能、列存储、分布式、可伸缩、实时读写的存储系统。在需要实时读写、随机访问超海量数据时，可以使用HBase。与hadoop一样，通过不断增加廉价的服务器，可以对HBase进行横向扩展，增加HBase的计算和存储能力。

HBase位于结构化存储层，Hadoop HDFS为HBase提供了高可靠性的底层存储支持，Hadoop MapReduce为HBase提供了高性能的计算能力，Zookeeper为HBase提供了稳定服务和failover机制。

<!--more-->

 ### HBase中表的特点：

1. 大：一个表可以有上亿行，上百万列
2. 面向列：面向列表（簇）的存储和权限控制，列（簇）独立检索
3. 稀疏：不存储为空的列，所有可以节约存储空间，表可以设计的非常稀疏
4. 非结构化：每一行都有一个可以排序的主键和任意多的列，列可以根据需要动态增加，每行可以存储不同的列
5. 数据多版本：每个单元中的数据可以有多个版本，默认情况下，版本号自动分配，版本号就是单元格插入时的时间戳
6. 数据类型单一：HBase中的数据都是字节
7. 查询单一，只支持根据rowKey的精确get查询和范围scan查询

### 什么时候选择HBase 

1. 超大数据量上高并发操作，高速插入，大量读取
2. 存储非结构化数据
3. 记录非常稀疏
4. 需要保存多个版本数据

### 与传统数据库区别

- 传统数据库

  - 传统数据库都是面向行进行数据存储，当字段过多或者条数上百万条的时候，查询性能会特别差，如果使用分库、分表来对数据库进行扩展，又会遇到分布式事务、跨数据库分页查询、负载均衡等问题。
  - 传统数据库支持复杂的sql查询


- hbase

  - hbase抛弃关系数据的面向行存储模式，而是采用基于列进行存储，将字段映射为hbase的一个列，查询中选择要查询的列，而不需要创建索引
  - hbase支持动态调整列，实现了字段的动态扩展。对应为空的列数据，hbase不会存储，节省了存储空间。
  - hbase将按照列族在磁盘上存储数据文件，实现了存储文件的拆分和合并，同时可以动态扩展regionServer来支持海量数据的存储和高并发的读写操作，
  - hbase可以存储一份数据的多个版本，对于数据的存储，hbase自动维护了一个时间戳，最新的数据版本排在最前面，通过rowKey+column+时间戳唯一确定一个shell。
  - 只可以通过rowKey进行查询，查询比较单一

### 与hadoop关系

Hadoop hdfs适合于存储非结构化数据，但是受限于hadoop MapReduce编程框架的高延迟数据处理机制，使得hadoop无法满足**大规模数据的实时处理**需求。

HBase是可以提供实时计算的分布式数据库，数据被保存在HDFS分布式文件系统上，由HDFS保证期高容错性。HBase上的数据是以StoreFile(HFile)二进制流的形式存储在HDFS上block块儿中；

HBase HRegion servers集群中的所有的region的数据在服务器启动时都是被打开的，并且在内冲初始化一些memstore，相应的这就在一定程度上加快系统响 应；而Hadoop中的block中的数据文件默认是关闭的，只有在需要的时候才打开，处理完数据后就关闭，这在一定程度上就增加了响应时间。

HBase能提供实时计算服务主要原因是由其架构和底层的数据结构决定的，即由LSM-Tree + HTable(region分区) + Cache决定，客户端可以直接定位到要查数据所在的HRegion server服务器，然后直接在服务器的一个region上查找要匹配的数据，客户端也可以缓存查询region位置的信息。

### 和Hive的区别

1. Hive是建立在Hadoop之上为了减少MapReduce jobs编写工作的批处理系统。HBase是为了支持弥补Hadoop对实时操作的缺陷的项目。
2. hive是高延迟、结构化和面向分析的，hbase是低延迟、非结构化和面向编程
3. Hive的表是**逻辑表**，它本身不存储和计算数据，它完全依赖于HDFS和MapReduce，高延迟的特点。HBase的表是**物理表**，hdfs作为底层存储，而HBase负责组织文件。 提供一个超大的内存hash表，搜索引擎通过它来存储索引，方便查询操作。

## 单机安装

- 解压hbase安装包

  ```shell
  tar -xzvf hbase-1.1.10-bin.tar.gz
  ```

- 配置hbase-env.sh

  ```xml
  export JAVA_HOME=/usr/java/jdk1.7.0_27 //Java 安装路径
  export HBASE_CLASSPATH=/hadoop/hbase-0.96.2 //HBase 类路径
  export HBASE_MANAGES_ZK=true //由 HBase 自己负责启动和关闭 Zookeeper
  ```

- 配置hbase-site.xml

  ```xml
  <?xml version="1.0"?>  
  <?xml-stylesheet type="text/xsl" href="configuration.xsl"?>  
  <configuration>  
    <property>  
      <!--指定storefile存储磁盘位置-->
      <name>hbase.rootdir</name>  
      <value>file:///DIRECTORY/hbase</value>  
      <!--hbase 中数据存放的HDFS根路径-->
      <!--<value>hdfs://hadoop01:9000/hbase</value>-->
    </property>  
    <property>
      <name>hbase.cluster.distributed</name>
      //hbase 是否安装在分布式环境中
      <value>true</value>
  </property>
  <property>
      //指定 Hbase 的 ZK 节点位置，由于上述已指定 Hbase 自己管理 ZK
      <name>hbase.zookeeper.quorum</name>
      <value>hadoop01</value>
  </property>
  <property>
      <name>dfs.replication</name>
      //伪分布环境，副本数为 1
      <value>1</value>
  </property>
  </configuration>  
  ```

- 启动hbase

  ```shell
  ./bin/start-hbase.sh
  ```

## 简单shell操作

- 连接本地hbase

  ```shell
  ./bin/hbase shell
  ```

- 指令 **help**，查看hbase用法

- 创建表

  ```shell
  #查看都有哪些表
  list
  #判断一个表是否存在
  exists '表名'
  #创建表
  Create '表名','列族1','列族2','列族N'
  #查看表信息
  describe "表名"
  #废弃表
  disable '表名'
  #删除表，只能删除disable后的表
  drop '表名'
  #清空表 disable-drop-create
  trancat '表名'
  #修改表结构，可以修改是否加入缓存、保留版本
  alter '表名'
  ```

- 操作表

  hdfs只支持写入和追加操作，所以hbase修改数据只能进行覆盖，用时间戳，获取时间戳最大的一行数据

  ```shell
  #保存数据，hbase的列由列族名和列名字组成，中间用:隔开，多个put可以连写，不要写;就可以
  Put '表名','行键rowKey','列族:列','列值'
  #删除一行数据
  deleteall '表名','rowkey'
  #删除该行的一列数据
  delete '表名','rowkey','列族:列名'
  #统计总行数
  count '表名'
  ```

- 查询

  ```shell
  #全表扫描
  scan '表名'
  #查询表中列族为info，RowKey范围是[lz0001, lz0003)的数据
  scan '表名', {COLUMNS => 'info', STARTROW => 'lz0001', ENDROW => 'lz0003'
  #查询表中RowKey以lz字符开头的
  scan '表名',{FILTER=>"PrefixFilter('lz')"}
  #根据rowkey获取
  get '表名','rowkey'
  #查询一行中一个列族所有信息
  get '表名','rowkey','列族名'
  #查询一行中一个列族中一列
  get '表名','rowkey','列族名','列名'  
  get '表名','rowkey','列族名:列名'
  #同时查询多个列族
  get '表名','rowkey','列族名:列名','列族名:列名'
  get '表名','rowkey',{COLUMN>=['列族名:列名','列族名:列名'],TIMESTAMP=>23232323}
  #查询列名包含a的cell
  get '表名', 'rowkey', {FILTER => "(QualifierFilter(=,'substring:a'))"}
  #获取二进制binary的值为“立志”的cell
  get '表名', 'rowkey', {FILTER => "ValueFilter(=, 'binary:立志')"}
  ```


## 配置

