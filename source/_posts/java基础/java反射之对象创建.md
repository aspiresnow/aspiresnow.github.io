---
title: 对象的创建
date: 2017-10-16 14:16:23
tags:
- 反射
categories:
- java
---

# 对象的创建

#### java创建对象的方式

-  1、直接new
-  2、通过反射clazz的newInstance调用无参构造函数创建对象
-  3、通过反射获取构造函数直接newInstance创建对象
-  4、实现Serializable接口，通过反系列化创建对象
-  5、实现Cloneable接口，覆盖clone方法，通过克隆创建对象

```java
package cn.zlz.createobj;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.lang.reflect.Constructor;

/**
 * 创建对象的方式
 * 1、直接new
 * 2、通过反射clazz的newInstance调用无参构造函数创建对象
 * 3、通过反射获取构造函数直接newInstance创建对象
 * 4、实现Serializable接口，通过反系列化创建对象
 * 5、实现Cloneable接口，覆盖clone方法，通过克隆创建对象
 *
 */
public class Main {

	public static void main(String[] args) {
		// 通过构造函数直接new
		Person person = new Person();
		System.out.println(person);
		// 通过反射创建对象
		createByReflect();
		// 通过构造器反射创建对象
		createByConstructor();
		// 通过序列化创建对象
		createBySerialize();
		//通过克隆创建对象
		createByClone();
		
	}

	private static void createByClone() {
		Person person = new Person("wangwu",5);
		Person clone = person.clone();
		System.out.println(clone);
	}
	private static void createBySerialize() {
		try {
			
			String filePath = "person.dat";
			Person instance = new Person("lizi",4);
			ObjectOutputStream objectOutputStream = new ObjectOutputStream(new FileOutputStream(  
					filePath));  
            objectOutputStream.writeObject(instance);  
            
			ObjectInputStream objectInputStream = new ObjectInputStream(new FileInputStream(filePath));
			Person person = (Person) objectInputStream.readObject();
			System.out.println(person);
		} catch (Exception e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
	}

	private static void createByConstructor() {
		try {
			Class<?> clazz = Class.forName("cn.zlz.createobj.Person");
			Constructor<?> constructor = clazz.getDeclaredConstructor(String.class, int.class);
			Person person = (Person) constructor.newInstance("zhangsan", 2);
			System.out.println(person);
		} catch (Exception e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
	}

	private static void createByReflect() {
		try {
			Class<?> clazz = Class.forName("cn.zlz.createobj.Person");
			Person person = (Person) clazz.newInstance();
			System.out.println(person);
		} catch (Exception e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
	}

}
package cn.zlz.createobj;

import java.io.Serializable;

public class Person implements Serializable, Cloneable {

	/**
	 * 
	 */
	private static final long serialVersionUID = 1L;
	private String name;
	private int age;

	public Person(String name, int age) {
		super();
		this.name = name;
		this.age = age;
	}

	public Person() {
		super();
	}

	@Override
	public String toString() {
		return "Person [name=" + name + ", age=" + age + "]";
	}

	@Override
	public Person clone() {
		Person person = null;
		try {
			return (Person) super.clone();
		} catch (CloneNotSupportedException e) {
			e.printStackTrace();
		}
		return person;
	}
}
```


​	