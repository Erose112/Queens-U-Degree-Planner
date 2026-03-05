"""
Parses course prerequisites
"""
from enum import Enum, auto
from itertools import product
import re

from app.models.prerequisite import PrerequisiteSet, PrerequisiteSetCourse


class TokenType(Enum):
    AND = auto()
    OR = auto()
    COURSE = auto()
    LPAREN = auto()
    RPAREN = auto()

# Bracketed [CSC108] or [ANAT 100]
COURSE_PATTERN = re.compile(r"\[([A-Z]{2,4}\s?\d{3})\]", re.IGNORECASE)
# Un-bracketed ANAT 100, CSC108, etc. (2–4 letters + optional space + 3 digits)
COURSE_PATTERN_PLAIN = re.compile(r"([A-Z]{2,4})\s?(\d{3})\b", re.IGNORECASE)



def _normalize_code(letters: str, digits: str) -> str:
    return (letters.replace(" ", "") + digits).upper()



def tokenize(text: str):
    tokens = []
    i = 0

    while i < len(text):
        if text[i].isspace():
            i += 1
            continue

        # Parentheses
        if text[i] == "(":
            tokens.append((TokenType.LPAREN, "("))
            i += 1
            continue

        if text[i] == ")":
            tokens.append((TokenType.RPAREN, ")"))
            i += 1
            continue

        # Course [CSC108] or [ANAT 100]
        course_match = COURSE_PATTERN.match(text, i)
        if course_match:
            code = course_match.group(1).replace(" ", "").upper()
            tokens.append((TokenType.COURSE, code))
            i = course_match.end()
            continue

        # Un-bracketed course code (e.g. ANAT 100, CSC108)
        plain_match = COURSE_PATTERN_PLAIN.match(text, i)
        if plain_match:
            code = _normalize_code(plain_match.group(1), plain_match.group(2))
            tokens.append((TokenType.COURSE, code))
            i = plain_match.end()
            continue

        # AND / OR (case-insensitive)
        if i + 3 <= len(text) and text[i:i+3].lower() == "and":
            tokens.append((TokenType.AND, "AND"))
            i += 3
            continue

        if i + 2 <= len(text) and text[i:i+2].lower() == "or":
            tokens.append((TokenType.OR, "OR"))
            i += 2
            continue

        # Ignore everything else (e.g. "Level 2", "Permission of...")
        i += 1

    return tokens


class Node:
    pass


class CourseNode(Node):
    def __init__(self, code):
        self.code = code


class AndNode(Node):
    def __init__(self, children):
        self.children = children


class OrNode(Node):
    def __init__(self, children):
        self.children = children



class Parser:
    """
    Parser for prerequisite logic.
    """
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def peek(self):
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def consume(self):
        token = self.peek()
        self.pos += 1
        return token

    def parse(self):
        return self.parse_and()

    def parse_and(self):
        """
        Parse an AND node.
        """
        nodes = [self.parse_or()]

        while self.peek() and self.peek()[0] == TokenType.AND:
            self.consume()
            nodes.append(self.parse_or())

        if len(nodes) == 1:
            return nodes[0]
        return AndNode(nodes)

    def parse_or(self):
        """
        Parse an OR node.
        """
        nodes = [self.parse_atom()]

        while self.peek() and self.peek()[0] == TokenType.OR:
            self.consume()
            nodes.append(self.parse_atom())

        if len(nodes) == 1:
            return nodes[0]
        return OrNode(nodes)

    def parse_atom(self):
        """
        Parse an atom node. Atom is a single course or a parenthetical expression.
        """
        token = self.peek()
        if token is None:
            raise ValueError("Unexpected end of input")

        if token[0] == TokenType.COURSE:
            self.consume()
            return CourseNode(token[1])

        if token[0] == TokenType.LPAREN:
            self.consume()
            node = self.parse()
            if self.peek() and self.peek()[0] == TokenType.RPAREN:
                self.consume()
            return node

        raise ValueError(f"Unexpected token: {token}")



def _distribute_or_over_and(node) -> Node:
    """
    Rewrite OR-over-AND to AND-of-ORs using the distributive law so the result
    fits the schema (AND of sets, OR within each set).
    E.g. A OR (B AND C) → (A OR B) AND (A OR C).
    """
    if isinstance(node, CourseNode):
        return node
    if isinstance(node, AndNode):
        return AndNode([_distribute_or_over_and(c) for c in node.children])
    if isinstance(node, OrNode):
        children = [_distribute_or_over_and(c) for c in node.children]
        and_terms = [c for c in children if isinstance(c, AndNode)]
        non_and = [c for c in children if not isinstance(c, AndNode)]
        if not and_terms:
            return OrNode(children)
        # (non_and OR and_1 OR and_2 OR ...) → AND of (non_and OR pick from each and_term)
        factors = []
        for combo in product(*[and_term.children for and_term in and_terms]):
            factor = OrNode(non_and + list(combo))
            factors.append(_distribute_or_over_and(factor))
        return AndNode(factors)
    return node


def _collect_course_codes(node) -> list[str]:
    """Recursively collect all course codes from a node (for OR flattening)."""
    if isinstance(node, CourseNode):
        return [node.code]
    if isinstance(node, OrNode):
        codes = []
        for child in node.children:
            codes.extend(_collect_course_codes(child))
        return codes
    if isinstance(node, AndNode):
        codes = []
        for child in node.children:
            codes.extend(_collect_course_codes(child))
        return codes
    return []


def ast_to_prerequisite_sets(
    node,
    course_id: int,
    course_lookup: dict[str, int],
):
    """
    Convert an Abstract Syntax Tree (AST) node into prerequisite sets for database storage.
    
    This function recursively processes prerequisite AST nodes and converts them into
    PrerequisiteSet objects that represent the logical requirements for a course.
    
    Args:
        node: AST node representing prerequisite logic (CourseNode, OrNode, or AndNode)
        course_id: The ID of the course that has these prerequisites
        course_lookup: Dictionary mapping course codes (e.g., "CSC148") to course IDs
    
    Returns:
        List of PrerequisiteSet objects representing the prerequisite requirements
        
    Examples:
        - CourseNode("CSC148") → One set with min_required=None (must take CSC148)
        - OrNode([CSC148, CSC165]) → One set with min_required=1 (take either one)
        - AndNode([CSC148, CSC165]) → Two sets with min_required=None (take both)
    """
    sets = []

    # CASE 1: Single Course Requirement
    # If this is just one course (e.g., "Must take CSC148")
    if isinstance(node, CourseNode):
        rid = course_lookup.get(node.code)
        if rid is None:
            return []  # Course not in catalog; skip this prereq
        ps = PrerequisiteSet(course_id=course_id, min_required=None)
        ps.required_courses.append(PrerequisiteSetCourse(required_course_id=rid))
        return [ps]

    # CASE 2: OR Logic (At Least One Required)
    # e.g. "CSC148 OR CSC165" → one set with min_required=1 and both courses.
    # "A OR (B AND C)" is rewritten to (A OR B) AND (A OR C) before we get here.
    if isinstance(node, OrNode):
        ps = PrerequisiteSet(course_id=course_id, min_required=1)
        seen = set()
        for child in node.children:
            for code in _collect_course_codes(child):
                rid = course_lookup.get(code)
                if rid is not None and rid not in seen:
                    seen.add(rid)
                    ps.required_courses.append(
                        PrerequisiteSetCourse(required_course_id=rid)
                    )
        if not ps.required_courses:
            return []
        return [ps]

    # CASE 3: AND Logic (All Required)
    # If this is an AND condition (e.g., "Take CSC148 AND CSC165")
    if isinstance(node, AndNode):
        # Recursively process each child and combine all their sets
        # Each child becomes its own separate requirement set
        for child in node.children:
            sets.extend(
                ast_to_prerequisite_sets(child, course_id, course_lookup)
            )
        return sets

    # CASE 4: Unknown/Unsupported Node Type
    # Return empty list if we encounter an unexpected node type
    return []



def parse_prerequisites(
    prereq_text: str,
    course_lookup: dict[str, int],
    course_id: int,
):
    if not prereq_text or not str(prereq_text).strip():
        return []
    tokens = tokenize(prereq_text)
    if not tokens:
        return []
    try:
        parser = Parser(tokens)
        ast = parser.parse()
        # Rewrite A OR (B AND C) → (A OR B) AND (A OR C) so we can store it
        ast = _distribute_or_over_and(ast)
        return ast_to_prerequisite_sets(ast, course_id, course_lookup)
    except (ValueError, KeyError, TypeError):
        # Unparseable or unknown course in prereq text — skip this course's prereqs
        return []
