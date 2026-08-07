#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import sys
from collections import defaultdict
from pathlib import Path

import yaml

CATEGORY_MAPPING = {
    "basic_info": ["basic_info", "Basic Info"],
    "technical_features": ["technical_features", "technical_characteristics", "Technical Features"],
    "performance_metrics": ["performance_metrics", "performance", "Performance Metrics"],
    "milestone_significance": ["milestone_significance", "milestones", "Milestone Significance"],
    "business_info": ["business_info", "commercial_info", "Business Info"],
    "competition_ecosystem": ["competition_ecosystem", "competition", "Competition Ecosystem"],
    "history": ["history", "History"],
    "market_positioning": ["market_positioning", "market", "Market Positioning"],
}

_SKIP_KEYS = {"_source_file", "uncertain"}
_NESTED_KEYS = {k for keys in CATEGORY_MAPPING.values() for k in keys}


def load_fields_yaml(fields_path):
    # Counting rule is shared with the TS store: src/research-store.ts counts
    # the same defined fields (total_fields) from fields.yaml — `- name:`
    # entries under `categories:` / `field_categories` only. Keep the two
    # adapters on the same denominator; the report/dashboard coverage math
    # depends on it.
    with fields_path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"fields.yaml at {fields_path} is not a mapping")
    all_fields = set()
    required_fields = set()
    field_categories = {}
    if "field_categories" in data:
        # Legacy schema: a list of {category, fields: [{name, required}]}.
        for category in data.get("field_categories", []):
            cat_name = category.get("category", "Unknown")
            for field in category.get("fields", []):
                fname = field.get("name")
                if not fname:
                    continue
                all_fields.add(fname)
                if field.get("required", False):
                    required_fields.add(fname)
                field_categories[fname] = cat_name
    elif "categories" in data:
        # Current schema: a mapping category -> list of {name, description, detail_level}.
        categories = data["categories"]
        if not isinstance(categories, dict):
            raise ValueError(
                f"'categories' in {fields_path} must be a mapping of category -> list of "
                f"field definitions, got {type(categories).__name__}"
            )
        for cat_name, fields in categories.items():
            if not isinstance(fields, list):
                continue
            for field in fields:
                if not isinstance(field, dict):
                    continue
                fname = field.get("name")
                if not fname:
                    continue
                all_fields.add(fname)
                # Current schema has no required/optional split: every defined field
                # gates the exit code, so treat all as required.
                required_fields.add(fname)
                field_categories[fname] = cat_name
    else:
        raise ValueError(
            f"fields.yaml at {fields_path} must define either 'field_categories' "
            "(legacy list of {category, fields}) or 'categories' "
            "(mapping of category -> list of {name, description, detail_level}); "
            f"found keys: {sorted(data)}"
        )
    return all_fields, required_fields, field_categories


def extract_json_fields(data, category_mapping=None):
    nested_keys = _NESTED_KEYS if category_mapping is None else {k for keys in category_mapping.values() for k in keys}
    fields = set()
    stack = [(data, True)]
    while stack:
        obj, is_category_level = stack.pop()
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in _SKIP_KEYS:
                    continue
                if is_category_level and k in nested_keys:
                    if isinstance(v, dict):
                        stack.append((v, True))
                    continue
                fields.add(k)
        elif isinstance(obj, list):
            for item in obj:
                if isinstance(item, dict):
                    stack.append((item, is_category_level))
    return fields


def collect_unresolved(data, all_fields):
    """Defined fields that are present-but-unresolved in a JSON item.

    A field counts as unresolved when its value is exactly "[uncertain]"
    (after stripping) at any depth, or when its name appears in the JSON's
    top-level "uncertain" array. Such fields are present, not missing.
    """
    unresolved = set()
    uncertain_names = data.get("uncertain") if isinstance(data, dict) else None
    if isinstance(uncertain_names, list):
        for name in uncertain_names:
            if isinstance(name, str) and name in all_fields:
                unresolved.add(name)
    stack = [data]
    while stack:
        obj = stack.pop()
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in _SKIP_KEYS:
                    continue
                if isinstance(v, str) and v.strip() == "[uncertain]" and k in all_fields:
                    unresolved.add(k)
                elif isinstance(v, (dict, list)):
                    stack.append(v)
        elif isinstance(obj, list):
            stack.extend(item for item in obj if isinstance(item, (dict, list)))
    return unresolved


def validate_json(json_path, all_fields, required_fields, field_categories):
    with json_path.open(encoding="utf-8") as f:
        data = json.load(f)
    json_fields = extract_json_fields(data)
    unresolved = collect_unresolved(data, all_fields)
    missing = (all_fields - json_fields) - unresolved
    present = (json_fields & all_fields) - unresolved
    extra = json_fields - all_fields
    missing_required = missing & required_fields
    missing_optional = missing - required_fields
    missing_by_category = defaultdict(list)
    for field in missing:
        missing_by_category[field_categories.get(field, "Unknown")].append(field)
    return {
        "file": json_path.name,
        "total_defined": len(all_fields),
        "present": len(present),
        "unresolved": sorted(unresolved),
        "unresolved_count": len(unresolved),
        "missing": len(missing),
        "missing_list": sorted(missing),
        "extra": len(extra),
        "coverage_rate": len(present) / len(all_fields) * 100 if all_fields else 100.0,
        "missing_required": sorted(missing_required),
        "missing_optional": sorted(missing_optional),
        "missing_by_category": {k: sorted(v) for k, v in missing_by_category.items()},
        "extra_fields": sorted(extra),
        "valid": len(missing_required) == 0,
    }


def print_result(result, verbose=True):
    status = "PASS" if result["valid"] else "FAIL"
    line = "=" * 60
    print(f"\n{line}")
    print(f"[{status}] {result['file']}")
    print(line)
    print(
        f"Defined: {result['total_defined']} · Present: {result['present']} · "
        f"Unresolved: {result['unresolved_count']} · Missing: {result['missing']}"
    )
    print(f"Coverage: {result['coverage_rate']:.1f}% ({result['present']}/{result['total_defined']})")
    if verbose and result["unresolved_count"]:
        print(f"\n[INFO] Present-but-unresolved fields ({result['unresolved_count']}):")
        print(f"  {', '.join(result['unresolved'])}")
    if result["missing_required"]:
        print(f"\n[ERROR] Missing required fields ({len(result['missing_required'])}):")
        print("\n".join(f"  - {f}" for f in result["missing_required"]))
    if verbose and result["missing_optional"]:
        missing_required = set(result["missing_required"])
        print(f"\n[WARN] Missing optional fields ({len(result['missing_optional'])}):")
        for cat in sorted(result["missing_by_category"]):
            optional = [f for f in result["missing_by_category"][cat] if f not in missing_required]
            if optional:
                print(f"  [{cat}]: {', '.join(optional)}")
    if verbose and result["extra_fields"]:
        extra = result["extra_fields"]
        print(f"\n[INFO] Extra fields ({len(extra)}):")
        print(f"  {', '.join(extra[:10])}")
        if len(extra) > 10:
            print(f"  ... and {len(extra) - 10} more")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Validate whether JSON files cover all fields defined in fields.yaml")
    parser.add_argument("--fields", "-f", type=str, help="Path to fields.yaml", default="fields.yaml")
    parser.add_argument("--json", "-j", type=str, nargs="*", help="JSON file paths to validate")
    parser.add_argument("--dir", "-d", type=str, help="Directory containing JSON files", default="results")
    parser.add_argument("--quiet", "-q", action="store_true", help="Show summary only")
    args = parser.parse_args()
    fields_path = Path(args.fields)
    if not fields_path.exists():
        for p in (Path.cwd() / "fields.yaml", Path.cwd().parent / "fields.yaml"):
            if p.exists():
                fields_path = p
                break
    if not fields_path.exists():
        print(f"[ERROR] fields.yaml not found: {fields_path}")
        sys.exit(1)
    print(f"Field definition file: {fields_path}")
    try:
        all_fields, required_fields, field_categories = load_fields_yaml(fields_path)
    except ValueError as exc:
        print(f"[ERROR] {exc}")
        sys.exit(1)
    print(f"Total fields: {len(all_fields)} (required: {len(required_fields)}, optional: {len(all_fields) - len(required_fields)})")
    json_files = (
        [Path(p) for p in args.json]
        if args.json
        else sorted(Path(args.dir).glob("*.json")) if Path(args.dir).exists() else []
    )
    if not json_files:
        print("[WARN] No JSON files found")
        sys.exit(0)
    results = []
    for json_path in json_files:
        if not json_path.exists():
            print(f"[WARN] File not found: {json_path}")
            continue
        result = validate_json(json_path, all_fields, required_fields, field_categories)
        results.append(result)
        print_result(result, verbose=not args.quiet)
    line = "=" * 60
    print(f"\n{line}")
    print("Summary")
    print(line)
    passed = sum(1 for r in results if r["valid"])
    avg_coverage = sum(r["coverage_rate"] for r in results) / len(results) if results else 0
    print(f"Validation passed: {passed}/{len(results)}")
    print(f"Average coverage: {avg_coverage:.1f}%")
    if passed < len(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
