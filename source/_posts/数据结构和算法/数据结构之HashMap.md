---
title: 数据结构之HashMap
date: 2019-06-22 17:25:26
tags:
- todo
categories:
- java

---

# 数据结构之HashMap

HashMap 1.8 与 1.7 对比

- HashMap创建对象的时候，1.8中数组的长度一定是2的倍数,无论构造器参数中initialCapacity传的多少

- 红黑树的出现，1.8 中当每个桶中的冲突超过 7 个时，链表则会转成红黑树，让 O(N) 访问效率转为O(logN)。

- 在 JDK 1.8 的实现中，优化了高位运算的算法，通过 hashCode() 的高 16 位异或低 16 位实现的，目的为了使得位置索引更离散些。

1.7 中 resize，只有当 size >= threshold 并且 table 中的那个槽中已经有 Entry 时，才会发生 resize。1.8 中只要大于 threshold 即扩容。

1.7 中添加元素时候，有冲突时，先遍历整个链表，确认是否已存在，不存在则进行头插法。而 1.8 中有冲突时候，链表形态下，是添加在尾部的。

1.7 中扩充时候，也是采用头插法，会导致之前元素相对位置倒置了。而 1.8 中扩充时，链表形态下，采用尾插法。之前元素相对位置未变化。



找到比当前值大的最小的2的幂次方的数作为table的长度

```java
static final int tableSizeFor(int cap) {
    int n = cap - 1;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    return (n < 0) ? 1 : (n >= MAXIMUM_CAPACITY) ? MAXIMUM_CAPACITY : n + 1;
}
```



因此，我们在扩充HashMap的时候，不需要像JDK1.7的实现那样重新计算hash，只需要看看原来的hash值新增的那个bit是1还是0就好了，是0的话索引没变，是1的话索引变成“原索引+oldCap”，可以看看下图为16扩充为32的resize示意图.
![img](https://img-blog.csdn.net/20171008102726065?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvVVNUQ19abg==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

这个设计确实非常的巧妙，既省去了重新计算hash值的时间，而且同时，由于新增的1bit是0还是1可以认为是随机的，因此resize的过程，均匀的把之前的冲突的节点分散到新的bucket了。这一块就是JDK1.8新增的优化点。有一点注意区别，JDK1.7中rehash的时候，旧链表迁移新链表的时候，如果在新表的数组索引位置相同，则链表元素会倒置，但是从上图可以看出，JDK1.8不会倒置。有兴趣的同学可以研究下JDK1.8的resize源码，写的很赞，如下:



因为2的幂-1都是11111结尾的，所以碰撞几率小。使Hash算法的结果均匀分布。这样计算之后， 在 n 为 2 ^ n 时， 其实相当于 hash % n，& 当然比 % 效率高



```java
static final int hash(Object key) {    
    int h;    
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

```java
table[(n - 1) & hash]
```

计算元素所在桶的下标的时候，是使用hash值&上(数组长度-1)。数组长度在上面说了都是2的n次方，所以减一之后二进制的低位都是1，如果数组长度很小，在进行&运算的时候只有hash的低位才能生效，高位都是0。为了尽可能的使元素分散到数组的不同槽位上，减少hash碰撞，在进行&运算的时候也要让hash值得高位参与进来，所以计算hash值得时候使用了hash值得高位异或低位算出来一个hash值。

那么问题来了，为什么是异或，而不是&或者|呢，因为 &会产生大量的0，|会产生大量的1，高位和低位的影响都是单方面的，异或是高位和低位都会起作用，所以选择了异或操作，能够使hash&长度-1更分散。

接下来就是我们要说的table的长度为什么必须是2的n次方：

1、保证为2次幂，n-1的二进制表示形式肯定是：00000.....1111，这样（n-1）&hash的结果肯定落在table区间里面，这是前提。

2、充分利用第一步进行异或的结果，是的table中的元素更加分散，减小了冲突。

3、便是在resize()时，使得扩展的数组更加分散，接下来详细分析resize实现过程。



```java
final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
               boolean evict) {
    //tab为数组，p为槽位中的节点，n为数组的长度，i为所属槽的下标
    Node<K,V>[] tab; Node<K,V> p; int n, i;
    //如果当前数组为空，resize初始化数组
    if ((tab = table) == null || (n = tab.length) == 0)
        n = (tab = resize()).length;
    //根据hash&长度计算出所属槽位，并将槽位中第一个节点赋值给p，
    //如果p为空，那么不存在hash冲突，直接创建一个节点放到该槽位
    if ((p = tab[i = (n - 1) & hash]) == null)
        tab[i] = newNode(hash, key, value, null);
    else {//发生了hash碰撞
        Node<K,V> e; K k;
        //hash碰撞 并且 key值完全相同，属于覆盖操作，要接着判断onlyIfAbsent属性，判断是否要覆盖
        if (p.hash == hash && ((k = p.key) == key || (key != null && key.equals(k))))
            e = p;
        //如果当前槽位节点是 TreeNode，走红黑树添加节点逻辑
        else if (p instanceof TreeNode)
            e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
        else {//发生了hash碰撞，当是与槽位中的key值不相同，循环链表上的所有节点判断
            for (int binCount = 0; ; ++binCount) {
                //如果到了链表的结尾，还没找到相同的key，创建新节点添加到链表尾部
                if ((e = p.next) == null) {
                    p.next = newNode(hash, key, value, null);
                    //如果链表长度超过变红黑树的阈值，将链表变为红黑树
                    if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
                        treeifyBin(tab, hash);
                    break;
                }
                //如果hash相同，并且key相同，覆盖操作
                if (e.hash == hash &&
                    ((k = e.key) == key || (key != null && key.equals(k))))
                    break;
                p = e;
            }
        }
        //覆盖操作，只有旧值为空或者非onlyIfAbsent情况下，用新值覆盖
        if (e != null) { // existing mapping for key
            V oldValue = e.value;
            if (!onlyIfAbsent || oldValue == null)
                e.value = value;
            afterNodeAccess(e);
            return oldValue;
        }
    }
    ++modCount;
    //size++，如果大于阈值，resize
    if (++size > threshold)
        resize();
    afterNodeInsertion(evict);
    return null;
}
```

resize流程,分两步，第一步是计算扩容后数组的长度和threshold，第二步是rehash重新将元素节点添加到新数组上。

```java
final Node<K,V>[] resize() {
    Node<K,V>[] oldTab = table;
    int oldCap = (oldTab == null) ? 0 : oldTab.length;
    int oldThr = threshold;
    int newCap, newThr = 0;
    if (oldCap > 0) {
        if (oldCap >= MAXIMUM_CAPACITY) {
            threshold = Integer.MAX_VALUE;
            return oldTab;
        }
        else if ((newCap = oldCap << 1) < MAXIMUM_CAPACITY &&
                 oldCap >= DEFAULT_INITIAL_CAPACITY)
            newThr = oldThr << 1; // double threshold
    }
    else if (oldThr > 0) // initial capacity was placed in threshold
        newCap = oldThr;
    else {               // zero initial threshold signifies using defaults
        newCap = DEFAULT_INITIAL_CAPACITY;
        newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY);
    }
    if (newThr == 0) {
        float ft = (float)newCap * loadFactor;
        newThr = (newCap < MAXIMUM_CAPACITY && ft < (float)MAXIMUM_CAPACITY ?
                  (int)ft : Integer.MAX_VALUE);
    }
    threshold = newThr;
    @SuppressWarnings({"rawtypes","unchecked"})
    Node<K,V>[] newTab = (Node<K,V>[])new Node[newCap];
    table = newTab;
    if (oldTab != null) {
        //循环数组中的元素
        for (int j = 0; j < oldCap; ++j) {
            Node<K,V> e;
            if ((e = oldTab[j]) != null) {
                oldTab[j] = null;
                if (e.next == null)
                    newTab[e.hash & (newCap - 1)] = e;
                else if (e instanceof TreeNode)
                    ((TreeNode<K,V>)e).split(this, newTab, j, oldCap);
                else { // preserve order
                    Node<K,V> loHead = null, loTail = null;
                    Node<K,V> hiHead = null, hiTail = null;
                    Node<K,V> next;
                    do {
                        next = e.next;
                        if ((e.hash & oldCap) == 0) {
                            if (loTail == null)
                                loHead = e;
                            else
                                loTail.next = e;
                            loTail = e;
                        }
                        else {
                            if (hiTail == null)
                                hiHead = e;
                            else
                                hiTail.next = e;
                            hiTail = e;
                        }
                    } while ((e = next) != null);
                    if (loTail != null) {
                        loTail.next = null;
                        newTab[j] = loHead;
                    }
                    if (hiTail != null) {
                        hiTail.next = null;
                        newTab[j + oldCap] = hiHead;
                    }
                }
            }
        }
    }
    return newTab;
}
```



## 参考

[【转】Java8系列之重新认识HashMap](https://www.jianshu.com/p/8a05e6e986a3?utm_campaign=maleskine&utm_content=note&utm_medium=seo_notes&utm_source=recommendation)

[JDK8 HashMap源码详解](https://www.jianshu.com/p/715918ac18f4)

[最新JDK8HashMamp实现过程源码分析（二）](https://blog.csdn.net/youngogo/article/details/81281959)

