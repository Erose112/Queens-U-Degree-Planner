from enum import Enum, auto
from app.models import PrerequisiteSet, PrerequisiteSetCourse

import re

class TokenType(Enum):
    AND = auto()
    OR = auto()
    COURSE = auto()
    LPAREN = auto()
    RPAREN = auto()

COURSE_PATTERN = re.compile(r"\[([A-Z]{3}\s?\d{3})\]", re.IGNORECASE)

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

        # Course [CSC108]
        course_match = COURSE_PATTERN.match(text, i)
        if course_match:
            code = course_match.group(1).replace(" ", "").upper()
            tokens.append((TokenType.COURSE, code))
            i = course_match.end()
            continue

        # AND / OR (case-insensitive)
        if text[i:i+3].lower() == "and":
            tokens.append((TokenType.AND, "AND"))
            i += 3
            continue

        if text[i:i+2].lower() == "or":
            tokens.append((TokenType.OR, "OR"))
            i += 2
            continue

        # Ignore everything else
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
        nodes = [self.parse_or()]

        while self.peek() and self.peek()[0] == TokenType.AND:
            self.consume()
            nodes.append(self.parse_or())

        if len(nodes) == 1:
            return nodes[0]
        return AndNode(nodes)

    def parse_or(self):
        nodes = [self.parse_atom()]

        while self.peek() and self.peek()[0] == TokenType.OR:
            self.consume()
            nodes.append(self.parse_atom())

        if len(nodes) == 1:
            return nodes[0]
        return OrNode(nodes)

    def parse_atom(self):
        token = self.peek()

        if token[0] == TokenType.COURSE:
            self.consume()
            return CourseNode(token[1])

        if token[0] == TokenType.LPAREN:
            self.consume()
            node = self.parse()
            self.consume()  # RPAREN
            return node

        raise ValueError("Unexpected token")


def ast_to_prerequisite_sets(
    node,
    course_id: int,
    course_lookup: dict[str, int],
):
    sets = []

    if isinstance(node, CourseNode):
        ps = PrerequisiteSet(course_id=course_id, min_required=None)
        ps.required_courses.append(
            PrerequisiteSetCourse(required_course_id=course_lookup[node.code])
        )
        return [ps]

    if isinstance(node, OrNode):
        ps = PrerequisiteSet(course_id=course_id, min_required=1)
        for child in node.children:
            if isinstance(child, CourseNode):
                ps.required_courses.append(
                    PrerequisiteSetCourse(
                        required_course_id=course_lookup[child.code]
                    )
                )
        return [ps]

    if isinstance(node, AndNode):
        for child in node.children:
            sets.extend(
                ast_to_prerequisite_sets(child, course_id, course_lookup)
            )
        return sets

    return []



def parse_prerequisites(
    prereq_text: str,
    course_lookup: dict[str, int],
    course_id: int,
):
    tokens = tokenize(prereq_text)
    parser = Parser(tokens)
    ast = parser.parse()

    return ast_to_prerequisite_sets(ast, course_id, course_lookup)
