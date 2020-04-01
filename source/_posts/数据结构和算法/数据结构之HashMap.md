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
- JDK8中是插入元素，再判断长度进行扩容，这时因为JDK8添加元素是一次遍历完成插入(+1)或者更新(**长度不变**)的，所以是添加完之后判断扩容，JDK7是先遍历一遍，存在直接更新，不存在再扩容 遍历找插入位置，所以JDK8只能后扩容，要不然肯定先扩容好，少copy一个新增的元素

1.7 中 resize，只有当 size >= threshold 并且 table 中的那个槽中已经有 Entry 时，才会发生 resize。1.8 中只要大于 threshold 即扩容。

1.7 中添加元素时候，有冲突时，先遍历整个链表，确认是否已存在，不存在则进行头插法。而 1.8 中有冲突时候，链表形态下，是添加在尾部的。

1.7 中扩充时候，也是采用头插法，会导致之前元素相对位置倒置了。而 1.8 中扩充时，链表形态下，采用尾插法。之前元素相对位置未变化。

HashMap中采用了数组+链表的数据结构，在jdk8中，当链表节点的个数超过一定数量之后，会转换为红黑树，所以在jdk8中HashMap的数据结构为 树组+链表+红黑树。

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/hashmap4.png?raw=true)

主要的问题在于基于头插法的数据迁移，会有几率造成链表倒置，从而引发链表闭链，导致程序死循环，并吃满CPU

这个设计确实非常的巧妙，既省去了重新计算hash值的时间，而且同时，由于新增的1bit是0还是1可以认为是随机的，因此resize的过程，均匀的把之前的冲突的节点分散到新的bucket了。这一块就是JDK1.8新增的优化点。有一点注意区别，JDK1.7中rehash的时候，旧链表迁移新链表的时候，如果在新表的数组索引位置相同，则链表元素会倒置，但是从上图可以看出，JDK1.8不会倒置。

HashMap是一种key value的结构体，在

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

首先来看下链表节点类型

```java
static class Node<K,V> implements Map.Entry<K,V> {
    final int hash;//key的hash值，避免重复计算，resize的时候使用
    final K key;//key
    V value;//value值
    Node<K,V> next;//下一个节点
}
```

接着看HashMap的构造器，接收一个数组长度的参数，和一个平衡因子，HashMap中能所能容纳的最大个数size=initialCapacity*loadFactor，不满足的时候，数组将进行扩容，每次扩容2倍长度，然后使用扩容后新的数组替换原数组。

```java
public HashMap(int initialCapacity, float loadFactor) {
    if (initialCapacity < 0)
        throw new IllegalArgumentException("Illegal initial capacity: " +
                                           initialCapacity);
    if (initialCapacity > MAXIMUM_CAPACITY)
        initialCapacity = MAXIMUM_CAPACITY;
    if (loadFactor <= 0 || Float.isNaN(loadFactor))
        throw new IllegalArgumentException("Illegal load factor: " +
                                           loadFactor);
    this.loadFactor = loadFactor;
    //这里只是赋值，当第一次添加元素的时候，threshold = table length *loadFactor
    this.threshold = tableSizeFor(initialCapacity);
}
```

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

因为2的幂 - 1都是11111结尾的，所以碰撞几率小。使Hash算法的结果均匀分布。这样计算之后， 在 n 为 2 ^ n 时， 其实相当于 hash % n，& 当然比 % 效率高

Hash算法的后两步运算（高位运算和取模运算，下文有介绍）来定位该键值对的存储位置，有时两个key会定位到相同的位置，表示发生了Hash碰撞。当然Hash算法计算结果越分散均匀，Hash碰撞的概率就越小，map的存取效率就会越高。

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

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/hashMap1.png?raw=true)

接下来就是我们要说的table的长度为什么必须是2的n次方：

1、保证为2次幂，n-1的二进制表示形式肯定是：00000.....1111，这样（n-1）&hash的结果肯定落在table区间里面，这是前提。

2、充分利用第一步进行异或的结果，是的table中的元素更加分散，减小了冲突。

3、便是在resize()时，使得扩展的数组更加分散，接下来详细分析resize实现过程。

### put添加元素流程

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/hashmap2.png?raw=true)

```java
public V put(K key, V value) {
    return putVal(hash(key), key, value, false, true);
}
```

调用putVal

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

当单个entry长度达到8
	如果当前map的长度小于64则table扩容
	如果当前map的长度大于64则当前entry转换为红黑树

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

JDK1.7中rehash的时候，旧链表迁移新链表的时候，如果在新表的数组索引位置相同，则链表元素会倒置，但是从上图可以看出，JDK1.8不会倒置

因此，我们在扩充HashMap的时候，不需要像JDK1.7的实现那样重新计算hash，只需要看看原来的hash值新增的那个bit是1还是0就好了，是0的话索引没变，是1的话索引变成“原索引+oldCap”，可以看看下图为16扩充为32的resize示意

这个设计确实非常的巧妙，既省去了重新计算hash值的时间，而且同时，由于新增的1bit是0还是1可以认为是随机的，因此resize的过程，均匀的把之前的冲突的节点分散到新的bucket了。这一块就是JDK1.8新增的优化点。有一点注意区别，JDK1.7中rehash的时候，旧链表迁移新链表的时候，如果在新表的数组索引位置相同，则链表元素会倒置，但是从上图可以看出，JDK1.8不会倒置。有兴趣的同学可以研究下JDK1.8的resize源码，写的很赞，如下:

![image](https://github.com/aspiresnow/aspiresnow.github.io/blob/hexo/source/blog_images/%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84/hashmap3.png?raw=true)

### get流程

```java
public V get(Object key) {
    Node<K,V> e;
    return (e = getNode(hash(key), key)) == null ? null : e.value;
}
```

调用getNode

```java
final Node<K,V> getNode(int hash, Object key) {
    Node<K,V>[] tab; Node<K,V> first, e; int n; K k;
    //先获取数组的头节点
    if ((tab = table) != null && (n = tab.length) > 0 &&
        (first = tab[(n - 1) & hash]) != null) {
        //如果头节点是要找的元素(hash相等并且key相等)，直接返回
        if (first.hash == hash && // always check first node
            ((k = first.key) == key || (key != null && key.equals(k))))
            return first;
        if ((e = first.next) != null) {
            //头节点不是所找元素，判断是否是红黑树，如果是则走红黑树查找流程
            if (first instanceof TreeNode)
                return ((TreeNode<K,V>)first).getTreeNode(hash, key);
            do {
                //链表，则遍历链表匹配元素
                if (e.hash == hash &&
                    ((k = e.key) == key || (key != null && key.equals(k))))
                    return e;
            } while ((e = e.next) != null);
        }
    }
    return null;
}
```

### 删除流程

```java
public V remove(Object key) {
    Node<K,V> e;
    return (e = removeNode(hash(key), key, null, false, true)) == null ?
        null : e.value;
}
```

调用removeNode

```java
final Node<K,V> removeNode(int hash, Object key, Object value,
                               boolean matchValue, boolean movable) {
    Node<K,V>[] tab; Node<K,V> p; int n, index;
    if ((tab = table) != null && (n = tab.length) > 0 &&
        (p = tab[index = (n - 1) & hash]) != null) {
        Node<K,V> node = null, e; K k; V v;
        if (p.hash == hash &&
            ((k = p.key) == key || (key != null && key.equals(k))))
            node = p;
        else if ((e = p.next) != null) {
            if (p instanceof TreeNode)
                node = ((TreeNode<K,V>)p).getTreeNode(hash, key);
            else {
                do {
                    if (e.hash == hash &&
                        ((k = e.key) == key ||
                         (key != null && key.equals(k)))) {
                        node = e;
                        break;
                    }
                    p = e;
                } while ((e = e.next) != null);
            }
        }
        if (node != null && (!matchValue || (v = node.value) == value ||
                             (value != null && value.equals(v)))) {
            if (node instanceof TreeNode)
                ((TreeNode<K,V>)node).removeTreeNode(this, tab, movable);
            else if (node == p)
                tab[index] = node.next;
            else
                p.next = node.next;
            ++modCount;
            --size;
            afterNodeRemoval(node);
            return node;
        }
    }
    return null;
}
```

### 死循环问题

jdk1.7的transfer是用头插法，新的链表和原来的是倒着的，所以这时候假如有两个线程，第一个线程只执行到**Entry next = e.next;**然后就第二个线程执行了，等到第二个线程执行完，其实这时候已经完成了扩容的任务，且链表里的顺序 已经倒置了，这时候第一个线程继续执行，这时候就把尾巴又指向头了，然后就造成了环。

JDK8中其实就是声明两对指针，维护两个链表，依次在末端添加新的元素。虽然解决了死循环问题，但还是会有其他问题，所以多线程还是尽量用ConcurrentHashMap。

### 线程安全问题

HashMap不是线程安全的，线程安全问题在操作共享遍历的时候会出现，在HashMap中 table、size是最主要的成员变量，所以在操作table和size的地方会出现线程安全问题

1. resize的时候会将table重新赋值，如果这个时候有多个线程并发resize，会出现获取到的resize前table是一个线程刚刚赋值的新的空table，造成丢失数据
2. table中的链表也是共享变量，当多个线程并发向链表尾部添加元素的时候，会出现覆盖丢失的情况
3. size变量共享操作的时候 ++size也会出现并发安全问题
4. 删除元素的时候，并发删除的时候也会出现覆盖问题

## 参考

[【转】Java8系列之重新认识HashMap](https://www.jianshu.com/p/8a05e6e986a3?utm_campaign=maleskine&utm_content=note&utm_medium=seo_notes&utm_source=recommendation)

[JDK8 HashMap源码详解](https://www.jianshu.com/p/715918ac18f4)

[最新JDK8HashMamp实现过程源码分析（二）](https://blog.csdn.net/youngogo/article/details/81281959)

[详解并发下的HashMap以及JDK8的优化](https://www.jianshu.com/p/e1c020d37c6a)

