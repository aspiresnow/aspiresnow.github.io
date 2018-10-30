---
title: Code Pieces
date: 2018-09-12 10:26:48
tags:
- 代码片段
categories:
- java基础
---

# Code Pieces

- 声明一个全局不可改变的map

  ```java
  public static final Map<String, String> SHORT_IDS;
  static {
      Map<String, String> map = new HashMap<>(64);
      map.put("ACT", "Australia/Darwin");
      map.put("AET", "Australia/Sydney");
      SHORT_IDS = Collections.unmodifiableMap(map);
  }
  ```

- spring中类型强转

  ```java
  BeanDefinitionDocumentReader.class.cast(BeanUtils.instantiateClass(this.documentReaderClass))
  ```

- 转换为驼峰模式

  ```java
  public static String getCamelCaseString(String inputString,
                                          boolean firstCharacterUppercase) {
      StringBuilder sb = new StringBuilder();
  
      boolean nextUpperCase = false;
      for (int i = 0; i < inputString.length(); i++) {
          char c = inputString.charAt(i);
          switch (c) {
              case '_':
              case '-':
              case '@':
              case '$':
              case '#':
              case ' ':
              case '/':
              case '&':
                  if (sb.length() > 0) {
                      nextUpperCase = true;
                  }
                  break;
              default:
                  if (nextUpperCase) {
                      sb.append(Character.toUpperCase(c));
                      nextUpperCase = false;
                  } else {
                      sb.append(Character.toLowerCase(c));
                  }
                  break;
          }
      }
  
      if (firstCharacterUppercase) {
          sb.setCharAt(0, Character.toUpperCase(sb.charAt(0)));
      }
  
      return sb.toString();
  }
  ```

- 替换 ${}

  ```java
  private String parsePropertyTokens(String string) {
      final String OPEN = "${"; //$NON-NLS-1$
      final String CLOSE = "}"; //$NON-NLS-1$
  
      String newString = string;
      if (newString != null) {
          int start = newString.indexOf(OPEN);
          int end = newString.indexOf(CLOSE);
  
          while (start > -1 && end > start) {
              String prepend = newString.substring(0, start);
              String append = newString.substring(end + CLOSE.length());
              String propName = newString.substring(start + OPEN.length(),end);
              String propValue = resolveProperty(propName);
              if (propValue != null) {
                  newString = prepend + propValue + append;
              }
              start = newString.indexOf(OPEN, end);
              end = newString.indexOf(CLOSE, end);
          }
      }
      return newString;
  }
  private String resolveProperty(String key) {
      String property = null;
      property = System.getProperty(key);
      if (property == null) {
          property = configurationProperties.getProperty(key);
      }
      if (property == null) {
          property = extraProperties.getProperty(key);
      }
      return property;
  }
  ```

- 字符串重复使用

  ```java
  StringBuilder sb = new StringBuilder();
  sb.append(calculateJavaClientImplementationPackage());
  sb.append('.');
  sb.append("DAOImpl"); //$NON-NLS-1$
  
  sb.setLength(0);
  sb.append('.');
  sb.append("DAO"); //$NON-NLS-1$
  ```

- 创建实现类

  ```java
  DocumentBuilderFactory bean = FactoryFinder.find(
                  DocumentBuilderFactory.class, 
                  "com.sun.org.apache.xerces.internal.jaxp.DocumentBuilderFactoryImpl");
  ```

- for循环

  ```java
  for(;;){
      System.out.println("11");
  }
  ```

- while循环一定执行一次

  ```java
  int counter = -1;
  while (counter == -1 || registry.containsBeanDefinition(id)) {
      counter++;
      id = generatedBeanName + GENERATED_BEAN_NAME_SEPARATOR + counter;
  }
  ```
