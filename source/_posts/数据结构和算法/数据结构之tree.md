---
title: 数据结构
date: 2017-11-22 17:25:26
tags:
- todo
categories:
- java

---

# 数据结构

问题-->逻辑结构-->存储结构-->实现操作

逻辑结构

- 集合
- 线性
- 树型
- 图型

存储结构

- 顺序存储
- 链式存储
- 索引
- 散列

算法

算法的优劣

- 时间复杂度
- 空间复杂度



二叉树是一种动态数据结构

```java
class Node{
  E e;
  Node left;
  Node right;
}
```

二分搜索树所有的节点都是可比较的，左子节点都比父节点小，右子节点都比父节点大

二分搜索树在极端情况下会退化成列表，使用递归的话会很危险

深度优先遍历(前序、中序、后序)：先往树下端找，到树最低端后往上遍历，使用递归实现

广度优先遍历(层序遍历) ：逐层向下遍历，使用非递归实现，需要借助队列





