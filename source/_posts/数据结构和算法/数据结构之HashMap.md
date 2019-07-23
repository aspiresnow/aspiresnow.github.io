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

红黑树的出现，1.8 中当每个桶中的冲突超过 7 个时，链表则会转成红黑树，让 O(N) 访问效率转为O(logN)。

在 JDK 1.8 的实现中，优化了高位运算的算法，通过 hashCode() 的高 16 位异或低 16 位实现的，目的为了使得位置索引更离散些。

1.7 中 resize，只有当 size >= threshold 并且 table 中的那个槽中已经有 Entry 时，才会发生 resize。1.8 中只要大于 threshold 即扩容。

1.7 中添加元素时候，有冲突时，先遍历整个链表，确认是否已存在，不存在则进行头插法。而 1.8 中有冲突时候，链表形态下，是添加在尾部的。

1.7 中扩充时候，也是采用头插法，会导致之前元素相对位置倒置了。而 1.8 中扩充时，链表形态下，采用尾插法。之前元素相对位置未变化。



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

resize流程

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





