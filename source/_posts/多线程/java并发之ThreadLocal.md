---
title: java并发之ThreadLocal
date: 2017-11-13 17:19:15
tags:
- 多线程
categories:
- java基础
---

# java并发之ThreadLocal

多线程中存在共享变量并发的问题，如果每个线程的变量只能自己才能访问到，那么就不会存在线程安全问题。ThreadLocal就是jdk中提供了用于存储线程本地变量的类。

对于多线程资源共享的问题，同步机制采用了“以时间换空间”的方式，而ThreadLocal采用了“以空间换时间”的方式。

<!--more-->

## 实现原理

- 每个线程都一个一个threadLocals变量，是一个map，定义在Thread类中，通过ThreadLocal进行初始化。用于存储线程所有的ThreadLocal

  ```java
  ThreadLocal.ThreadLocalMap threadLocals = null;
  ```

- ThreadLocal的set方法，获取当前线程的threadLocals变量，如果不为空则以当前threadLocal对象为key，存储变量

  值得**注意**：map中的key是threadLocal对象，这是因为一个线程可以持有多个threadLocal对象

  ```java
  public void set(T value) {
      Thread t = Thread.currentThread();
      ThreadLocalMap map = getMap(t);//获取当前线程的threadLocals
      if (map != null)
          map.set(this, value);
      else
          createMap(t, value);
  }
  ```

- 如果没有map，则创建map，并存储变量

  ```java
  void createMap(Thread t, T firstValue) {
      t.threadLocals = new ThreadLocalMap(this, firstValue);
  }
  ```

- ThreadLocal的get方法，先获取当前线程的ThreadLocalMap，然后以调用者threadLocal为key获取变量

  ```java
  public T get() {
      Thread t = Thread.currentThread();
      ThreadLocalMap map = getMap(t);//t.threadLocals
      if (map != null) {
          ThreadLocalMap.Entry e = map.getEntry(this);
          if (e != null) {
              @SuppressWarnings("unchecked")
              T result = (T)e.value;
              return result;
          }
      }
      return setInitialValue();
  }
  ```

- ThreadLocal的remove方法，移除以当前ThreadLocal对象为key的值

  ```java
  public void remove() {
      ThreadLocalMap m = getMap(Thread.currentThread());
      if (m != null)
          m.remove(this);
  }
  ```

## 父子线程间通信InheritableThreadLocal

- Thread类中有属性用于父线程给子线程传递变量

  ```java
  ThreadLocal.ThreadLocalMap inheritableThreadLocals = null;
  ```

- InheritableThreadLocal继承ThreadLocal，用于父线程向子线程传递变量

  ```java
  public class InheritableThreadLocal<T> extends ThreadLocal<T> {
     //为子线程传递变量
      protected T childValue(T parentValue) {
          return parentValue;
      }
  	//覆写 getMap 返回inheritableThreadLocals
      ThreadLocalMap getMap(Thread t) {
         return t.inheritableThreadLocals;
      }
  	//覆写 createMap 创建ThreadLocalMap并为inheritableThreadLocals赋值
      void createMap(Thread t, T firstValue) {
          t.inheritableThreadLocals = new ThreadLocalMap(this, firstValue);
      }
  }
  ```

- Thread创建的时候在init方法中会判断父线程的inheritableThreadLocals是否为空，如果不为空会把父线程中inheritableThreadLocals定义属性拷贝一份到当前线程的inheritableThreadLocals中

  ```java
  private void init(ThreadGroup g, Runnable target, String name,
                    long stackSize, AccessControlContext acc) {
    ...
    Thread parent = currentThread();
    ...
      if (parent.inheritableThreadLocals != null)
        this.inheritableThreadLocals = ThreadLocal.createInheritedMap(parent.inheritableThreadLocals);
    ...
  }
  ```

- ThreadLocal中对父线程中的inheritableThreadLocals属性进行了浅拷贝，key和value都是原来的引用地址，这样子线程通过InheritableThreadLocal的get方法就能获取到父线程中定义的引用，通过引用访问变量

  ```java
  static ThreadLocalMap createInheritedMap(ThreadLocalMap parentMap) {
      return new ThreadLocalMap(parentMap);
  }
  private ThreadLocalMap(ThreadLocalMap parentMap) {
    Entry[] parentTable = parentMap.table;
    int len = parentTable.length;
    setThreshold(len);
    table = new Entry[len];

    for (int j = 0; j < len; j++) {
      Entry e = parentTable[j];
      if (e != null) {
        @SuppressWarnings("unchecked")
        ThreadLocal<Object> key = (ThreadLocal<Object>) e.get();
        if (key != null) {
          Object value = key.childValue(e.value);
          Entry c = new Entry(key, value);
          int h = key.threadLocalHashCode & (len - 1);
          while (table[h] != null)
            h = nextIndex(h, len);
          table[h] = c;
          size++;
        }
      }
    }
  }
  ```

## 用法 

- InheritableThreadLocal 可以继承父线程的属性值

```java
public class TestThreadLocal{

	static final ThreadLocal<String> threadLocal = new ThreadLocal<String>();
	static final InheritableThreadLocal<String> inheritableThreadLocal = new InheritableThreadLocal<String>();
	public static void main(String[] args) {
		threadLocal.set("主线程局部变量");
		inheritableThreadLocal.set("可继承的父类的局部变量");
		new Thread(new Runnable() {
			
			@Override
			public void run() {
				System.out.println(threadLocal.get());//null
				System.out.println(inheritableThreadLocal.get());//可继承的父类的局部变量
			}
		}).start();
	}
}
```

- 自定义ThreadLocal

```java
public class ThreadLocalTest
{
	private static int data = 1;

	static ThreadLocal threadLocal = new ThreadLocal();
	public static void main(String[] args)
	{
		for (int i = 0; i < 2; i++)
		{
			new Thread(new Runnable()
			{
				@Override
				public void run()
				{
					int data = new Random().nextInt();
					MyThreadLocal.getInstance().put("data", data);
					System.out.println(Thread.currentThread().getName()
							+ " get data " + data);
					System.out.println(Thread.currentThread().getName()
							+ MyThreadLocal.getInstance());
					new A().get();
					new B().get();
				}
			}).start();
		}
	}

	static class A
	{
		public void get()
		{
			System.out.println("A from " + Thread.currentThread().getName()
					+ " get data " + MyThreadLocal.getInstance().get("data"));
		}
	}

	static class B
	{
		public void get()
		{
			System.out.println("B from " + Thread.currentThread().getName()
					+ " get data " + MyThreadLocal.getInstance().get("data"));
		}
	}

	static class MyThreadLocal extends HashMap
	{
		private MyThreadLocal()
		{
		};
		private static MyThreadLocal instance;

		public static MyThreadLocal getInstance()
		{// 因为每个线程不一样对象，所以不需要添加同步
			if (threadLocal.get() == null)
			{
				instance = new MyThreadLocal();
				map.set(instance);
			}
			return (MyThreadLocal) map.get();
		}
	}
}
```
- 数据库连接实现线程绑定

```java
import java.io.InputStream;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;

import cn.zlz.exception.DaoException;

public class JdbcUtils {
	
	private JdbcUtils(){}
	
	private static String url;
	private static String user;
	private static String password;
	
	
	private static ThreadLocal<Connection> tl = new ThreadLocal<Connection>();
	
	// 将四要素抽取至配置文件
	static {
		try {
			//读取配置文件   获得四要素
			Properties props = new Properties();
			InputStream inStream = JdbcUtils.class.getClassLoader()
					.getResourceAsStream("jdbc.properties");
			props.load(inStream);
			
			String driverClass = props.getProperty("driverClass");
			url = props.getProperty("url");
			user = props.getProperty("user");
			password = props.getProperty("password");
			
			// 注册驱动
			Class.forName(driverClass);
		} catch (Exception e) {
			throw new ExceptionInInitializerError(e);
		}
	}
	
	// 获得数据库连接
	public static Connection getConnection() throws SQLException {
		// 返回当前线程绑定的连接  原因是该连接上有事务
		Connection conn = tl.get();
		// 如果conn 为 null    说明线程上未绑定连接
		if(conn==null) {
			// 获得与数据库的连接
			conn = DriverManager.getConnection(url, user, password);
			// 绑定到当前线程
			tl.set(conn);
		}
		return conn;
	}
	
	// 开启事务
	public static void startTransaction() {
		try {
			// 获得当前线程上绑定的连接
			Connection conn = getConnection();
			// 开启事务
			conn.setAutoCommit(false);
		} catch (SQLException e) {
			throw new DaoException(e);
		}
	}
	
	// 提交事务
	public static void commit() {
		// 获得当前线程上绑定的连接
		Connection conn = tl.get();
		// 判断
		if(conn!=null) {
			try {
				// 如果线程上有连接 提交该连接事务
				conn.commit();
			} catch (SQLException e) {
				throw new DaoException(e);
			}
		}
	}
	
	// 回滚事务
	public static void rollback() {
		// 获得当前线程上绑定的连接
		Connection conn = tl.get();
		// 判断
		if(conn!=null) {
			try {
				// 如果线程上有连接 回滚事务
				conn.rollback();
			} catch (SQLException e) {
				throw new DaoException(e);
			}
		}
	}
	
	// 关闭连接     关闭当前线程上绑定的连接
	public static void close() {
		// 获得当前线程上绑定的连接
		Connection conn = tl.get();
		// 判断
		if(conn!=null) {
			try {
				// 如果线程上有连接 关闭连接
				conn.close();
			} catch (SQLException e) {
				throw new DaoException(e);
			}
			// 移除当前线程绑定的 connnection 对象
			tl.remove();
		}
	}
	
	public static void release(Connection conn, Statement stmt, ResultSet rs) {
		if(rs!=null) {
			try {
				rs.close();
			} catch (SQLException e) {
				e.printStackTrace();
			}
			rs = null;
		}
		
		if(stmt!=null) {
			try {
				stmt.close();
			} catch (SQLException e) {
				e.printStackTrace();
			}
			stmt = null;
		}
		
		if(conn!=null) {
			try {
				conn.close();
			} catch (SQLException e) {
				e.printStackTrace();
			}
			conn = null;
		}
	}
}
```
## 参考资料