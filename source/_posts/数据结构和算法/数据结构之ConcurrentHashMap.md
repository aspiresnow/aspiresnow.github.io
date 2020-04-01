---
title: 数据结构之ConcurrentHashMap
date: 2019-11-18 17:25:26
tags:
- todo
categories:
- java

---

# 数据结构之ConcurrentHashMap

## 1.8对比1.7

- 1.7中使用 数组+Segment+数组+链表 的存储结构。Segment 继承于 ReentrantLock。每个Segment中使用锁来控制线程安全。 ConcurrentHashMap 支持的并发数就等于Segment的数量。
- 1.8中抛弃了分段锁，跟HashMap一样使用数组+链表+红黑树的数据结构，同时使用CAS+Synchronized+减小锁粒度来实现线程安全。当桶中没有元素的时候，CAS创建新元素，当有元素的时候，锁住头节点进行添加
- 1.8中在 resize过程中，设计了MOVED状态，当前线程可以去帮助其他线程同时并发进行resize
- 1.8中在get的时候，是完全不需要锁的，会单独判断是否是resize，如果是会去resize扩容后的数组中查询元素。
- 1.7中的ConcurrentHashMap由于并发数受限于Segment的数量，同时桶中存储的都是链表，所以查询遍历效率低于1.8
- JDK1.8的实现降低锁的粒度，JDK1.7版本锁的粒度是基于Segment的，包含多个HashEntry，而JDK1.8锁的粒度就是HashEntry（首节点）
- JDK1.8使用红黑树来优化链表，基于长度很长的链表的遍历是一个很漫长的过程，而红黑树的遍历效率是很快的，代替一定阈值的链表，这样形成一个最佳拍档

### 源码解读

#### put操作

```java
public V put(K key, V value) {
    return putVal(key, value, false);
}

final V putVal(K key, V value, boolean onlyIfAbsent) {
    if (key == null || value == null) throw new NullPointerException();
    //计算key的hash值，用于确定所在桶的位置
    int hash = spread(key.hashCode());
    int binCount = 0;
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh;
        //延迟初始化 map，当第一次put时候，map为空，再初始化map
        if (tab == null || (n = tab.length) == 0)
            tab = initTable();
        //根据hash找到所在桶的位置，如果为空，添加头节点，使用CAS添加
        else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            if (casTabAt(tab, i, null,
                         new Node<K,V>(hash, key, value, null)))
                break;                   // no lock when adding to empty bin
        }
        //当前节点正在rehash，map处于resize过程中，当前线程加入resize过程，多线程resize
        else if ((fh = f.hash) == MOVED)
            tab = helpTransfer(tab, f);
        else {
            //如果当前桶中已经有了链表，锁住头节点，将新元素添加到链表尾部，
            V oldVal = null;
            synchronized (f) {
              	//判断头结点是否发生变化，如果发生变化，重新循环尝试
                if (tabAt(tab, i) == f) {
                    //大于0，代表是链表
                    if (fh >= 0) {
                        binCount = 1;
                        for (Node<K,V> e = f;; ++binCount) {
                            K ek;
                            if (e.hash == hash &&
                                ((ek = e.key) == key ||
                                 (ek != null && key.equals(ek)))) {
                                oldVal = e.val;
                                if (!onlyIfAbsent)
                                    e.val = value;
                                break;
                            }
                            Node<K,V> pred = e;
                            if ((e = e.next) == null) {
                                pred.next = new Node<K,V>(hash, key,
                                                          value, null);
                                break;
                            }
                        }
                    }//如果节点是树，走红黑树添加节点流程
                    else if (f instanceof TreeBin) {
                        Node<K,V> p;
                        binCount = 2;
                        if ((p = ((TreeBin<K,V>)f).putTreeVal(hash, key,
                                                              value)) != null) {
                            oldVal = p.val;
                            if (!onlyIfAbsent)
                                p.val = value;
                        }
                    }
                }
            }
            //当链表阈值达到8，转换为红黑树
            if (binCount != 0) {
                if (binCount >= TREEIFY_THRESHOLD)
                    treeifyBin(tab, i);
                if (oldVal != null)
                    return oldVal;
                break;
            }
        }
    }
    //添加完元素之后，跟新size，同时如果满足条件，链表扩容，进行resize和rehash
    addCount(1L, binCount);
    return null;
}
```

put的操作流程

1、首先计算hash值
2、循环数组，如果当前数组为空，进行初始化，map都是第一次put的时候进行初始化的，初始化完成后再次循环，尝试添加元素
3、如果找到所在桶的位置，并且没有任何元素，创建Node并CAS 赋值到这个桶上。失败就再进入循环，成功则break跳出
4、 如果当前桶存在Node，不过状态是MOVED，代表当前正在进行resize 和rehash，则当前工作线程加入rehash过程，并发加快rehash过程。结束后重新赋值数组为扩容后的数组，再次进入循环尝试添加元素的操作
5、如果找到头节点，使用Synchronized锁住头节点，如果是链表，创建新的节点添加到链表尾部，如果是红黑树，走红黑树添加节点流程，添加完成后释放锁。
6、添加完成后判断当前链表是否达到阈值8，满足则转换为红黑树，转换过程中也对头结点进行加锁
7、添加完成后更新map的size，同时如果达到阈值，进行resize

#### 初始化map

创建一个指定长度的Node数组，在创建的过程中使用CAS保证了线程安全

```java
private final Node<K,V>[] initTable() {
    Node<K,V>[] tab; int sc;
    while ((tab = table) == null || tab.length == 0) {
        //下面在初始化开始前会CAS将sizeCtl设置为-1，如果其他线程已经在初始化，当前线程自旋
        if ((sc = sizeCtl) < 0)
            Thread.yield(); // lost initialization race; just spin
        else if (U.compareAndSwapInt(this, SIZECTL, sc, -1)) {
            try {
                if ((tab = table) == null || tab.length == 0) {
                    int n = (sc > 0) ? sc : DEFAULT_CAPACITY;
                    @SuppressWarnings("unchecked")
                    Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n];
                    table = tab = nt;
                    //数组大小*0.75
                    sc = n - (n >>> 2);
                }
            } finally {
                sizeCtl = sc;
            }
            break;
        }
    }
    return tab;
}
```

#### 帮助resize和rehash

判断桶的节点是否等于MOVED来判断当前是否在进行扩容，当前线程会假如扩容过程，加速扩容，然后返回扩容后的数组

```java
final Node<K,V>[] helpTransfer(Node<K,V>[] tab, Node<K,V> f) {
    Node<K,V>[] nextTab; int sc;
    //当前正在扩容
    if (tab != null && (f instanceof ForwardingNode) &&
        (nextTab = ((ForwardingNode<K,V>)f).nextTable) != null) {
        int rs = resizeStamp(tab.length);
        while (nextTab == nextTable && table == tab &&
               (sc = sizeCtl) < 0) {
            //扩容结束了，跳出
            if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                sc == rs + MAX_RESIZERS || transferIndex <= 0)
                break;
            if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1)) {
                //增加一个线程进行扩容
                transfer(tab, nextTab);
                break;
            }
        }
        return nextTab;
    }
    return table;
}
```

实际进行扩容

```java
private final void transfer(Node<K,V>[] tab, Node<K,V>[] nextTab) {
    int n = tab.length, stride;
    if ((stride = (NCPU > 1) ? (n >>> 3) / NCPU : n) < MIN_TRANSFER_STRIDE)
        stride = MIN_TRANSFER_STRIDE; // subdivide range
    if (nextTab == null) {            // initiating
        try {
            @SuppressWarnings("unchecked")
            //创建扩容后的数组，扩容2倍
            Node<K,V>[] nt = (Node<K,V>[])new Node<?,?>[n << 1];
            nextTab = nt;
        } catch (Throwable ex) {      // try to cope with OOME
            sizeCtl = Integer.MAX_VALUE;
            return;
        }
        nextTable = nextTab;
        transferIndex = n;
    }
    int nextn = nextTab.length;
    //创建一个扩容中的节点，并将扩容后的数组添加到这个节点中属性
    ForwardingNode<K,V> fwd = new ForwardingNode<K,V>(nextTab);
   // 当advance == true时，表明该桶中的节点已经处理过了
    boolean advance = true;
    boolean finishing = false; // to ensure sweep before committing nextTab
    for (int i = 0, bound = 0;;) {
        Node<K,V> f; int fh;
        while (advance) {
            int nextIndex, nextBound;
            if (--i >= bound || finishing)
                advance = false;
            else if ((nextIndex = transferIndex) <= 0) {
                i = -1;
                advance = false;
            }
            else if (U.compareAndSwapInt
                     (this, TRANSFERINDEX, nextIndex,
                      nextBound = (nextIndex > stride ?
                                   nextIndex - stride : 0))) {
                bound = nextBound;
                i = nextIndex - 1;
                advance = false;
            }
        }
        if (i < 0 || i >= n || i + n >= nextn) {
            int sc;
            //完成了所有桶中节点的rehash
            if (finishing) {
                nextTable = null;
                table = nextTab;//使用扩容后的数组替换之前的
                sizeCtl = (n << 1) - (n >>> 1);//阈值扩大
                return;
            }
            if (U.compareAndSwapInt(this, SIZECTL, sc = sizeCtl, sc - 1)) {
                if ((sc - 2) != resizeStamp(n) << RESIZE_STAMP_SHIFT)
                    return;
                finishing = advance = true;
                i = n; // recheck before commit
            }
        }
        else if ((f = tabAt(tab, i)) == null)
            advance = casTabAt(tab, i, null, fwd);
        else if ((fh = f.hash) == MOVED)
            advance = true; // already processed
        else {
            //rehash的时候，头节点加锁
            synchronized (f) {
                if (tabAt(tab, i) == f) {
                    Node<K,V> ln, hn;
                    if (fh >= 0) {
                        //rehash后，一个槽中的节点要么去 x+n处，要么在原槽中，所以构造两个链表
                        int runBit = fh & n;
                        Node<K,V> lastRun = f;
                        for (Node<K,V> p = f.next; p != null; p = p.next) {
                            int b = p.hash & n;
                            if (b != runBit) {
                                runBit = b;
                                lastRun = p;
                            }
                        }
                        if (runBit == 0) {
                            ln = lastRun;
                            hn = null;
                        }
                        else {
                            hn = lastRun;
                            ln = null;
                        }
                        for (Node<K,V> p = f; p != lastRun; p = p.next) {
                            int ph = p.hash; K pk = p.key; V pv = p.val;
                            if ((ph & n) == 0)
                                ln = new Node<K,V>(ph, pk, pv, ln);
                            else
                                hn = new Node<K,V>(ph, pk, pv, hn);
                        }
                        setTabAt(nextTab, i, ln);// 在nextTable i 位置处插上链表
                        setTabAt(nextTab, i + n, hn);// 在nextTable i + n 位置处插上链表
                        setTabAt(tab, i, fwd); //table i位置处插上ForwardingNode 表示该节点已经处理过了
                        advance = true;
                    }
                    else if (f instanceof TreeBin) {
                        TreeBin<K,V> t = (TreeBin<K,V>)f;
                        TreeNode<K,V> lo = null, loTail = null;
                        TreeNode<K,V> hi = null, hiTail = null;
                        int lc = 0, hc = 0;
                        for (Node<K,V> e = t.first; e != null; e = e.next) {
                            int h = e.hash;
                            TreeNode<K,V> p = new TreeNode<K,V>
                                (h, e.key, e.val, null, null);
                            if ((h & n) == 0) {
                                if ((p.prev = loTail) == null)
                                    lo = p;
                                else
                                    loTail.next = p;
                                loTail = p;
                                ++lc;
                            }
                            else {
                                if ((p.prev = hiTail) == null)
                                    hi = p;
                                else
                                    hiTail.next = p;
                                hiTail = p;
                                ++hc;
                            }
                        }
                        // 扩容后树节点个数若<=6，将树转链表
                        ln = (lc <= UNTREEIFY_THRESHOLD) ? untreeify(lo) :
                        (hc != 0) ? new TreeBin<K,V>(lo) : t;
                        hn = (hc <= UNTREEIFY_THRESHOLD) ? untreeify(hi) :
                        (lc != 0) ? new TreeBin<K,V>(hi) : t;
                        setTabAt(nextTab, i, ln);
                        setTabAt(nextTab, i + n, hn);
                        setTabAt(tab, i, fwd);
                        advance = true;
                    }
                }
            }
        }
    }
}
```

#### 重新计算size过程

```java
private final void addCount(long x, int check) {
    CounterCell[] as; long b, s;
    //更新baseCount，table的数量，counterCells表示元素个数的变化
    if ((as = counterCells) != null ||
        !U.compareAndSwapLong(this, BASECOUNT, b = baseCount, s = b + x)) {
        CounterCell a; long v; int m;
        boolean uncontended = true;
        //如果多个线程都在执行，则CAS失败，执行fullAddCount，全部加入count
        if (as == null || (m = as.length - 1) < 0 ||
            (a = as[ThreadLocalRandom.getProbe() & m]) == null ||
            !(uncontended =
              U.compareAndSwapLong(a, CELLVALUE, v = a.value, v + x))) {
            fullAddCount(x, uncontended);
            return;
        }
        if (check <= 1)
            return;
        s = sumCount();
    }
     //check>=0表示需要进行扩容操作
    if (check >= 0) {
        Node<K,V>[] tab, nt; int n, sc;
        while (s >= (long)(sc = sizeCtl) && (tab = table) != null &&
               (n = tab.length) < MAXIMUM_CAPACITY) {
            int rs = resizeStamp(n);
            if (sc < 0) {
                if ((sc >>> RESIZE_STAMP_SHIFT) != rs || sc == rs + 1 ||
                    sc == rs + MAX_RESIZERS || (nt = nextTable) == null ||
                    transferIndex <= 0)
                    break;
                if (U.compareAndSwapInt(this, SIZECTL, sc, sc + 1))
                    transfer(tab, nt);
            }
            //当前线程发起库哦哦让操作，nextTable=null
            else if (U.compareAndSwapInt(this, SIZECTL, sc,
                                         (rs << RESIZE_STAMP_SHIFT) + 2))
                transfer(tab, null);
            s = sumCount();
        }
    }
}
```

#### get操作

1.计算hash值，根据hash值去找桶的位置，如果头结点正好是匹配元素，直接返回
 2.如果当前map正在扩容，元素会有一部分移动到扩容后的数组上，这时就需要去 扩容后的数组中查询
 3.如果还没找到，就遍历链表或者红黑树查找元素

```java
public V get(Object key) {
    Node<K,V>[] tab; Node<K,V> e, p; int n, eh; K ek;
    //计算key的hash值
    int h = spread(key.hashCode());
    //判断数组不为空，并且根据hash值计算桶的位置不为空，则存在该元素
    if ((tab = table) != null && (n = tab.length) > 0 &&
        (e = tabAt(tab, (n - 1) & h)) != null) {
        //取出所在桶的链表，判断头结点是否是所找目标，如果是直接返回
        if ((eh = e.hash) == h) {
            if ((ek = e.key) == key || (ek != null && key.equals(ek)))
                return e.val;
        }
        //eh小于0的时候，即-1，当前map正在resise，rehash。已经将旧数组中的链表移动到扩容后的数组上了。所以当前e是ForwardingNode，会去扩容后的数组中查找目标值
        else if (eh < 0)
            return (p = e.find(h, key)) != null ? p.val : null;
        while ((e = e.next) != null) {
            if (e.hash == h &&
                ((ek = e.key) == key || (ek != null && key.equals(ek))))
                return e.val;
        }
    }
    return null;
}
```

ForwardingNode覆写了find方法，当正在rehash过程中时，扩容后的数组放到ForwardingNode中 nextTable，所以需要去这里查找目标元素

```java
static final class ForwardingNode<K,V> extends Node<K,V> {
    final Node<K,V>[] nextTable;
    ForwardingNode(Node<K,V>[] tab) {
        super(MOVED, null, null, null);
        this.nextTable = tab;
    }

    Node<K,V> find(int h, Object k) {
        // loop to avoid arbitrarily deep recursion on forwarding nodes
        outer: for (Node<K,V>[] tab = nextTable;;) {
            Node<K,V> e; int n;
            if (k == null || tab == null || (n = tab.length) == 0 ||
                (e = tabAt(tab, (n - 1) & h)) == null)
                return null;
            for (;;) {
                int eh; K ek;
                if ((eh = e.hash) == h &&
                    ((ek = e.key) == k || (ek != null && k.equals(ek))))
                    return e;
                if (eh < 0) {
                    if (e instanceof ForwardingNode) {
                        tab = ((ForwardingNode<K,V>)e).nextTable;
                        continue outer;
                    }
                    else
                        return e.find(h, k);
                }
                if ((e = e.next) == null)
                    return null;
            }
        }
    }
}
```

### 在JDK1.7和JDK1.8中的区别

在JDK1.8主要设计上的改进有以下几点:

1、**不采用segment而采用链表的头节点，减小了锁粒度**。
 2、设计了MOVED状态 当resize的中过程中 线程2还在put数据，线程2会帮助resize。
 3、使用3个**CAS操作来确保node的一些操作的原子性**，这种方式代替了锁。
 4、sizeCtl的不同值来代表不同含义，起到了控制的作用。
 **采用synchronized而不是ReentrantLock**

## 参考

[ConcurrentHashMap底层实现原理(JDK1.7 & 1.8)](https://www.jianshu.com/p/865c813f2726)

[谈谈ConcurrentHashMap1.7和1.8的不同实现](https://www.jianshu.com/p/e694f1e868ec)
[深入浅出ConcurrentHashMap1.8](https://www.jianshu.com/p/c0642afe03e0)
[深入分析ConcurrentHashMap1.8的扩容实现](https://www.jianshu.com/p/f6730d5784ad)