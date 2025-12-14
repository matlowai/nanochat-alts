import os
import ast
import json
import re
import sys
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Set

# Configuration
ROOT_DIR = "."
OUTPUT_GRAPH = "knowledge_graph.json"
OUTPUT_REPORT = "GAP_REPORT.md"
KB_DIR = "docs/knowledge_base"
ALLOWED_LIBRARIES = {"torch", "numpy", "tiktoken"} # External libs we allow as concept nodes

@dataclass
class ConceptRef:
    concept_id: str
    file_path: str
    line_number: int
    type: str  # 'learn', 'def', 'viz', 'todo'
    context: str = ""

@dataclass
class CodeNode:
    name: str
    type: str  # 'file', 'class', 'function'
    file_path: str
    line_start: int
    line_end: int
    docstring: Optional[str] = None
    children: List['CodeNode'] = field(default_factory=list)

class CodeIndexer:
    def __init__(self, root_dir: str):
        self.root_dir = root_dir
        self.concepts: Dict[str, Dict] = {} # id -> metadata
        self.refs: List[ConceptRef] = []
        self.code_tree: Dict[str, CodeNode] = {} # file_path -> root node

    def scan(self):
        """Recursively scan the codebase."""
        # Whitelist of directories to scan to avoid venv/node_modules noise
        # We can also add an "allowed_libraries" feature later if needed
        allowed_dirs = {"nanochat", "scripts", "tasks", "tests", "rustbpe", "dev"}
        
        for root, dirs, files in os.walk(self.root_dir):
            # Modify dirs in-place to prune traversal
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__" and d != "node_modules"]
            
            # If we are at the root, only traverse into allowed_dirs
            if root == self.root_dir:
                dirs[:] = [d for d in dirs if d in allowed_dirs]

            for file in files:
                if file.endswith(".py"):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, self.root_dir)
                    self.parse_file(full_path, rel_path)

        self.scan_kb()

    def parse_file(self, full_path: str, rel_path: str):
        """Parse a single Python file for AST and comments."""
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            # 1. AST Parsing for structure
            tree = ast.parse(content)
            file_node = CodeNode(
                name=rel_path,
                type="file",
                file_path=rel_path,
                line_start=1,
                line_end=len(content.splitlines()),
                docstring=ast.get_docstring(tree)
            )
            
            # Track imports for this file: alias -> full_name
            # e.g. "nn" -> "torch.nn", "F" -> "torch.nn.functional"
            imports = {}
            
            self.visit_ast(tree, file_node, imports, rel_path)
            self.code_tree[rel_path] = file_node

            # 2. Comment Parsing for tags
            self.extract_tags(content, rel_path)

        except Exception as e:
            print(f"Error parsing {rel_path}: {e}")

    def visit_ast(self, node, parent: CodeNode, imports: Dict[str, str], file_path: str):
        """Recursively visit AST nodes to build the code tree and find usages."""
        
        # Handle Imports to build the alias map
        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.name
                asname = alias.asname or name
                imports[asname] = name
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                name = alias.name
                asname = alias.asname or name
                full_name = f"{module}.{name}" if module else name
                imports[asname] = full_name

        # Handle Usages (Attribute and Name)
        # We look for things like 'nn.Linear' (Attribute) or 'torch' (Name)
        # Simplified: check if the root of the expression is in imports and matches allowed libs
        if isinstance(node, ast.Attribute):
            # e.g. nn.Linear -> value=Name(id='nn'), attr='Linear'
            if isinstance(node.value, ast.Name):
                root_alias = node.value.id
                if root_alias in imports:
                    full_root = imports[root_alias]
                    resolved_name = f"{full_root}.{node.attr}"
                    self.check_and_add_usage(resolved_name, file_path, node.lineno)
        
        elif isinstance(node, ast.Name):
            # e.g. torch
            if node.id in imports:
                resolved_name = imports[node.id]
                self.check_and_add_usage(resolved_name, file_path, node.lineno)

        # Recurse
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                child_node = CodeNode(
                    name=child.name,
                    type="class" if isinstance(child, ast.ClassDef) else "function",
                    file_path=parent.file_path,
                    line_start=child.lineno,
                    line_end=child.end_lineno if hasattr(child, "end_lineno") else child.lineno,
                    docstring=ast.get_docstring(child)
                )
                parent.children.append(child_node)
                self.visit_ast(child, child_node, imports, file_path)
            else:
                self.visit_ast(child, parent, imports, file_path)

    def check_and_add_usage(self, resolved_name: str, file_path: str, lineno: int):
        """If resolved_name belongs to an allowed lib, add a reference."""
        # Check if it starts with any allowed lib
        for lib in ALLOWED_LIBRARIES:
            if resolved_name == lib or resolved_name.startswith(lib + "."):
                # Avoid duplicates per file/line if possible, or just append
                # We'll use a special type 'auto' to distinguish
                self.refs.append(ConceptRef(
                    concept_id=resolved_name,
                    file_path=file_path,
                    line_number=lineno,
                    type="auto",
                    context="Auto-detected usage"
                ))
                return

    def extract_tags(self, content: str, rel_path: str):
        """Extract @learn, @def, @viz, @todo tags from comments."""
        lines = content.splitlines()
        # Regex for tags: # @tag:id or # @tag:id:context
        # Supports: learn, def, viz, todo
        tag_pattern = re.compile(r"#\s*@(learn|def|viz|todo):([a-zA-Z0-9_.]+)(?::(.*))?")
        
        for i, line in enumerate(lines):
            match = tag_pattern.search(line)
            if match:
                tag_type = match.group(1)
                concept_id = match.group(2)
                context = match.group(3).strip() if match.group(3) else ""
                
                self.refs.append(ConceptRef(
                    concept_id=concept_id,
                    file_path=rel_path,
                    line_number=i + 1,
                    type=tag_type,
                    context=context
                ))

    def scan_kb(self):
        """Scan the knowledge base directory for defined concepts."""
        kb_path = os.path.join(self.root_dir, KB_DIR)
        if not os.path.exists(kb_path):
            return

        for root, _, files in os.walk(kb_path):
            for file in files:
                if file.endswith(".md"):
                    # Assuming filename is concept_id.md for now, or we parse frontmatter
                    concept_id = file.replace(".md", "")
                    self.concepts[concept_id] = {
                        "source": "kb",
                        "path": os.path.relpath(os.path.join(root, file), self.root_dir)
                    }

    def generate_graph(self):
        """Generate the knowledge graph JSON."""
        nodes = []
        links = []
        
        # Add File Nodes and their children (Classes/Functions)
        def add_code_node(node: CodeNode, parent_id: Optional[str] = None):
            node_id = node.file_path if node.type == 'file' else f"{node.file_path}:{node.name}"
            
            # For functions/classes, we want a unique ID. 
            # If it's a method, it might be file:Class:method. 
            # But our CodeNode structure is recursive.
            # Let's use a simple path-based ID.
            
            nodes.append({
                "id": node_id,
                "type": node.type,
                "label": node.name,
                "docstring": node.docstring or "",
                "line_start": node.line_start,
                "line_end": node.line_end,
                "file_path": node.file_path,
                "source": "repo"
            })
            
            if parent_id:
                links.append({
                    "source": parent_id,
                    "target": node_id,
                    "type": "contains"
                })
            
            for child in node.children:
                add_code_node(child, node_id)

        for path, node in self.code_tree.items():
            add_code_node(node)
        
        # Add Concept Nodes
        # Collect all unique concept IDs from refs and KB
        all_concepts = set(self.concepts.keys())
        for ref in self.refs:
            all_concepts.add(ref.concept_id)
            
        for cid in all_concepts:
            # Check if it's an external library concept (e.g. torch.Tensor)
            is_external = False
            library = None
            for lib in ALLOWED_LIBRARIES:
                if cid.startswith(lib + ".") or cid == lib:
                    is_external = True
                    library = lib
                    break
            
            status = "defined" if cid in self.concepts else ("external" if is_external else "missing")
            
            # Check if this concept is referenced as a visualization
            viz_ref = next((r for r in self.refs if r.concept_id == cid and r.type == 'viz'), None)
            
            node_data = {
                "id": f"concept:{cid}",
                "type": "concept",
                "label": cid,
                "status": status,
                "source": "external" if is_external else "kb"
            }
            if library:
                node_data["library"] = library
            
            if viz_ref:
                node_data["viz_id"] = cid
                
            nodes.append(node_data)

            # Hierarchy Extraction (Up Hops)
            if is_external and "." in cid:
                parent = cid.rsplit(".", 1)[0]
                curr = cid
                while "." in curr:
                    parent = curr.rsplit(".", 1)[0]
                    if f"concept:{parent}" not in [n["id"] for n in nodes]: # inefficient check but ok for now
                        # Determine library for parent
                        parent_lib = None
                        for lib in ALLOWED_LIBRARIES:
                            if parent.startswith(lib + ".") or parent == lib:
                                parent_lib = lib
                                break
                        
                        nodes.append({
                            "id": f"concept:{parent}",
                            "type": "concept",
                            "label": parent,
                            "status": "external",
                            "source": "external",
                            "library": parent_lib
                        })
                    links.append({
                        "source": f"concept:{curr}",
                        "target": f"concept:{parent}",
                        "type": "hierarchy"
                    })
                    curr = parent

        # Add Links (File <-> Concept)
        for ref in self.refs:
            links.append({
                "source": ref.file_path,
                "target": f"concept:{ref.concept_id}",
                "type": ref.type,
                "line": ref.line_number
            })

        return {"nodes": nodes, "links": links}

    def generate_report(self):
        """Generate the GAP Analysis Report."""
        report = ["# Gap Analysis Report\n"]
        
        # 1. Missing Definitions
        report.append("## Missing Concept Definitions")
        report.append("The following concepts are referenced in code but have no Knowledge Base entry:\n")
        
        missing_concepts = set()
        for ref in self.refs:
            # Don't report TODOs, External Libs, or Auto-detected refs as "missing definitions"
            is_external = any(ref.concept_id.startswith(lib + ".") or ref.concept_id == lib for lib in ALLOWED_LIBRARIES)
            if ref.concept_id not in self.concepts and ref.type != 'todo' and not is_external:
                missing_concepts.add(ref.concept_id)
        
        if not missing_concepts:
            report.append("- *None! Good job.*")
        else:
            for cid in sorted(missing_concepts):
                report.append(f"- [ ] `{cid}`")
                # Find where it's used
                usages = [r for r in self.refs if r.concept_id == cid]
                for u in usages[:3]: # limit to 3
                    report.append(f"  - {u.file_path}:{u.line_number}")
                if len(usages) > 3:
                    report.append(f"  - ... and {len(usages)-3} more")

        # 2. TODOs
        report.append("\n## Explicit TODOs")
        todos = [r for r in self.refs if r.type == 'todo']
        if not todos:
            report.append("- *No TODOs found.*")
        else:
            for todo in todos:
                report.append(f"- [ ] **{todo.concept_id}**: {todo.context} ({todo.file_path}:{todo.line_number})")

        return "\n".join(report)

def main():
    indexer = CodeIndexer(ROOT_DIR)
    print(f"Scanning {ROOT_DIR}...")
    indexer.scan()
    
    # Generate Graph
    graph = indexer.generate_graph()
    with open(OUTPUT_GRAPH, "w") as f:
        json.dump(graph, f, indent=2)
    print(f"Generated {OUTPUT_GRAPH} with {len(graph['nodes'])} nodes and {len(graph['links'])} links.")

    # Generate Report
    report = indexer.generate_report()
    with open(OUTPUT_REPORT, "w") as f:
        f.write(report)
    print(f"Generated {OUTPUT_REPORT}.")

if __name__ == "__main__":
    main()
