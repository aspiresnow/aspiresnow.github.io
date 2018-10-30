---
title: hbase的容错
date: 2017-09-14 00:01:46
tags:
- hbase
categories:
- 大数据
---

# HBase容错性

Master容错：Zookeeper重新选择一个新的Master
　　1).无Master过程中，数据读取仍照常进行；
　　2).无master过程中，region切分、负载均衡等无法进行；
RegionServer容错：定时向Zookeeper汇报心跳，如果一旦时间内未出现心跳
　　1).Master将该RegionServer上的Region重新分配到其他RegionServer上；
　　2).失效服务器上“预写”HLog日志由主服务器进行分割并派送给新的RegionServer
Zookeeper容错：Zookeeper是一个可靠地服务
　　1).一般配置3或5个Zookeeper实例。



region分配

　　任何时刻，一个region只能分配给一个region server。master记录了当前有哪些可用的region server。以及当前哪些region分配给了哪些region server，哪些region还没有分配。当存在未分配的region，并且有一个region server上有可用空间时，master就给这个region server发送一个装载请求，把region分配给这个region server。region server得到请求后，就开始对此region提供服务。