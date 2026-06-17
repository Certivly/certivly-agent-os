import { describe, it, expect, beforeAll } from 'bun:test';
import { ParserRegistry } from '../src/registry';

describe('Multi-Language Parser Layer', () => {
  let registry: ParserRegistry;

  beforeAll(async () => {
    registry = new ParserRegistry();
    await registry.initialize();
  });

  it('should parse Python correctly', () => {
    const code = `
from os import path
import sys

def hello():
    print(path)

class Greeter:
    def greet(self):
        hello()
    `;

    const ast = registry.parseFile('test.py', code);
    
    expect(ast).toBeDefined();
    if (!ast) return;
    
    expect(ast.language).toBe('python');
    
    const classes = ast.nodes.filter(n => n.kind === 'class');
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe('Greeter');

    const functions = ast.nodes.filter(n => n.kind === 'function');
    expect(functions.length).toBe(1);
    expect(functions[0].name).toBe('hello');

    const methods = ast.nodes.filter(n => n.kind === 'method');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('greet');
    // @ts-ignore
    expect(methods[0].parent).toBe('Greeter');

    const imports = ast.nodes.filter(n => n.kind === 'import');
    expect(imports.length).toBe(2);
    // @ts-ignore
    expect(imports.some(i => i.source === 'os')).toBe(true);

    const calls = ast.nodes.filter(n => n.kind === 'call');
    expect(calls.length).toBe(2); // print and hello
    // @ts-ignore
    expect(calls.some(c => c.callee === 'hello')).toBe(true);
  });

  it('should parse Go correctly', () => {
    const code = `
package main

import "fmt"

type Greeter struct {}

func hello() {
	fmt.Println("hello")
}

func (g *Greeter) greet() {
	hello()
}
    `;

    const ast = registry.parseFile('test.go', code);
    
    expect(ast).toBeDefined();
    if (!ast) return;
    
    expect(ast.language).toBe('go');
    
    const classes = ast.nodes.filter(n => n.kind === 'class');
    expect(classes.length).toBe(1); // mapped struct to class
    expect(classes[0].name).toBe('Greeter');

    const functions = ast.nodes.filter(n => n.kind === 'function');
    expect(functions.length).toBe(1);
    expect(functions[0].name).toBe('hello');

    const methods = ast.nodes.filter(n => n.kind === 'method');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('greet');
    // @ts-ignore
    expect(methods[0].parent).toBe('Greeter');

    const imports = ast.nodes.filter(n => n.kind === 'import');
    expect(imports.length).toBe(1);
    // @ts-ignore
    expect(imports[0].source).toBe('fmt');

    const calls = ast.nodes.filter(n => n.kind === 'call');
    expect(calls.length).toBe(2); // fmt.Println and hello
    // @ts-ignore
    expect(calls.some(c => c.callee === 'hello')).toBe(true);
  });

  it('should parse Rust correctly', () => {
    const code = `
use std::fmt;

struct Greeter {}

fn hello() {
    println!("hello");
}

impl Greeter {
    fn greet(&self) {
        hello();
    }
}
    `;

    const ast = registry.parseFile('test.rs', code);
    
    expect(ast).toBeDefined();
    if (!ast) return;
    
    expect(ast.language).toBe('rust');
    
    const classes = ast.nodes.filter(n => n.kind === 'class');
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe('Greeter');

    const functions = ast.nodes.filter(n => n.kind === 'function');
    expect(functions.length).toBe(1);
    expect(functions[0].name).toBe('hello');

    const methods = ast.nodes.filter(n => n.kind === 'method');
    expect(methods.length).toBe(1);
    expect(methods[0].name).toBe('greet');
    // @ts-ignore
    expect(methods[0].parent).toBe('Greeter');

    const imports = ast.nodes.filter(n => n.kind === 'import');
    expect(imports.length).toBe(1);
    // @ts-ignore
    expect(imports[0].source).toBe('std::fmt');

    const calls = ast.nodes.filter(n => n.kind === 'call');
    expect(calls.length).toBe(1); // hello()
    // @ts-ignore
    expect(calls.some(c => c.callee === 'hello')).toBe(true);
  });
});
