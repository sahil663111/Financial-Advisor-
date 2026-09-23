"""
Employee Service — Phase 5.
CRUD for employees + salary structure management.
"""
from datetime import datetime
from typing import Optional
from bson import ObjectId

from app.utils.exceptions import not_found, conflict, bad_request
from app.business.payroll.schemas import (
    CreateEmployeeRequest, UpdateEmployeeRequest,
    EmployeeStatus, PF_EMPLOYEE_RATE, PF_EMPLOYER_RATE, PF_WAGE_CEILING,
    ESIC_EMPLOYEE_RATE, ESIC_EMPLOYER_RATE, ESIC_WAGE_CEILING,
)


async def _next_employee_code(org_id: str, db) -> str:
    count = await db.employees.count_documents({"org_id": org_id})
    return f"EMP-{count + 1:04d}"


def compute_salary_summary(employee: dict) -> dict:
    """
    Compute gross, statutory deductions, and net salary from salary structure.
    This is deterministic — the LLM never touches payroll math.
    """
    basic       = employee.get("basic_salary", 0.0)
    hra         = employee.get("hra", 0.0)
    special     = employee.get("special_allowance", 0.0)
    other_allow = employee.get("other_allowances", 0.0)
    gross       = round(basic + hra + special + other_allow, 2)

    # PF
    pf_emp = 0.0
    pf_er  = 0.0
    if employee.get("pf_applicable", True) and basic > 0:
        pf_base = min(basic, PF_WAGE_CEILING)
        pf_emp  = round(pf_base * PF_EMPLOYEE_RATE, 2)
        pf_er   = round(pf_base * PF_EMPLOYER_RATE, 2)

    # ESIC
    esic_emp = 0.0
    esic_er  = 0.0
    if gross <= ESIC_WAGE_CEILING and gross > 0:
        esic_emp = round(gross * ESIC_EMPLOYEE_RATE, 2)
        esic_er  = round(gross * ESIC_EMPLOYER_RATE, 2)

    tds        = employee.get("tds_monthly", 0.0)
    prof_tax   = employee.get("professional_tax", 0.0)
    other_ded  = employee.get("other_deductions", 0.0)

    total_deductions = round(pf_emp + esic_emp + tds + prof_tax + other_ded, 2)
    net_salary       = round(gross - total_deductions, 2)

    # Total employer cost
    employer_cost = round(gross + pf_er + esic_er, 2)

    return {
        "gross_salary":       gross,
        "pf_employee":        pf_emp,
        "pf_employer":        pf_er,
        "esic_employee":      esic_emp,
        "esic_employer":      esic_er,
        "tds":                tds,
        "professional_tax":   prof_tax,
        "other_deductions":   other_ded,
        "total_deductions":   total_deductions,
        "net_salary":         net_salary,
        "employer_cost":      employer_cost,
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def create_employee(
    org_id: str, user_id: str,
    data: CreateEmployeeRequest, db, request=None,
) -> dict:
    # Check duplicate email within org
    if await db.employees.find_one({"org_id": org_id, "email": data.email}):
        raise conflict(f"Employee with email '{data.email}' already exists")

    now  = datetime.utcnow()
    code = data.employee_code or await _next_employee_code(org_id, db)

    doc = {
        "org_id":                  org_id,
        "employee_code":           code,
        "first_name":              data.first_name,
        "last_name":               data.last_name,
        "full_name":               f"{data.first_name} {data.last_name}",
        "email":                   data.email,
        "phone":                   data.phone,
        "designation":             data.designation,
        "department":              data.department,
        "employment_type":         data.employment_type.value,
        "status":                  EmployeeStatus.ACTIVE.value,
        "date_of_joining":         data.date_of_joining,
        "date_of_birth":           data.date_of_birth,
        "pan_number":              data.pan_number,
        "aadhaar_number":          data.aadhaar_number,
        "bank_name":               data.bank_name,
        "bank_account_number":     data.bank_account_number,
        "ifsc_code":               data.ifsc_code,
        # Salary structure
        "basic_salary":            data.basic_salary,
        "hra":                     data.hra,
        "special_allowance":       data.special_allowance,
        "other_allowances":        data.other_allowances,
        "pf_applicable":           data.pf_applicable,
        "esic_applicable":         data.esic_applicable,
        "tds_monthly":             data.tds_monthly,
        "professional_tax":        data.professional_tax,
        "other_deductions":        data.other_deductions,
        "other_deductions_label":  data.other_deductions_label,
        "created_by":              user_id,
        "created_at":              now,
        "updated_at":              now,
    }
    # Attach computed salary summary
    doc["salary_summary"] = compute_salary_summary(doc)

    result = await db.employees.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def list_employees(
    org_id: str, db,
    search: Optional[str] = None,
    department: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> dict:
    query: dict = {"org_id": org_id}
    if status:
        query["status"] = status.upper()
    else:
        query["status"] = EmployeeStatus.ACTIVE.value   # default: active only
    if department:
        query["department"] = {"$regex": department, "$options": "i"}
    if search:
        query["$or"] = [
            {"full_name":      {"$regex": search, "$options": "i"}},
            {"email":          {"$regex": search, "$options": "i"}},
            {"employee_code":  {"$regex": search, "$options": "i"}},
            {"designation":    {"$regex": search, "$options": "i"}},
        ]

    skip  = (page - 1) * limit
    total = await db.employees.count_documents(query)
    cursor = db.employees.find(query).sort("full_name", 1).skip(skip).limit(limit)

    items = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["salary_summary"] = compute_salary_summary(doc)
        items.append(doc)

    return {"data": items, "total": total, "page": page,
            "pages": (total + limit - 1) // limit}


async def get_employee(org_id: str, employee_id: str, db) -> dict:
    doc = await db.employees.find_one(
        {"_id": ObjectId(employee_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Employee")
    doc["_id"] = str(doc["_id"])
    doc["salary_summary"] = compute_salary_summary(doc)
    return doc


async def update_employee(
    org_id: str, employee_id: str, user_id: str,
    data: UpdateEmployeeRequest, db, request=None,
) -> dict:
    doc = await db.employees.find_one(
        {"_id": ObjectId(employee_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Employee")

    updates = data.model_dump(exclude_none=True)
    if "employment_type" in updates:
        updates["employment_type"] = updates["employment_type"].value
    if "status" in updates:
        updates["status"] = updates["status"].value

    updates["updated_at"] = datetime.utcnow()

    # Recompute full_name if name changed
    first = updates.get("first_name", doc["first_name"])
    last  = updates.get("last_name", doc["last_name"])
    updates["full_name"] = f"{first} {last}"

    await db.employees.update_one(
        {"_id": ObjectId(employee_id)}, {"$set": updates}
    )
    return await get_employee(org_id, employee_id, db)


async def terminate_employee(
    org_id: str, employee_id: str, user_id: str,
    reason: Optional[str], db, request=None,
) -> dict:
    doc = await db.employees.find_one(
        {"_id": ObjectId(employee_id), "org_id": org_id}
    )
    if not doc:
        raise not_found("Employee")
    if doc["status"] == EmployeeStatus.TERMINATED.value:
        raise bad_request("Employee is already terminated")

    await db.employees.update_one(
        {"_id": ObjectId(employee_id)},
        {"$set": {
            "status":             EmployeeStatus.TERMINATED.value,
            "termination_reason": reason,
            "terminated_at":      datetime.utcnow(),
            "updated_at":         datetime.utcnow(),
        }},
    )
    return await get_employee(org_id, employee_id, db)


async def get_department_summary(org_id: str, db) -> list[dict]:
    """Aggregated headcount and payroll cost by department."""
    pipeline = [
        {"$match": {"org_id": org_id, "status": EmployeeStatus.ACTIVE.value}},
        {
            "$group": {
                "_id": "$department",
                "headcount":        {"$sum": 1},
                "total_gross":      {"$sum": "$basic_salary"},   # simplified
                "total_basic":      {"$sum": "$basic_salary"},
            }
        },
        {"$sort": {"headcount": -1}},
    ]
    result = [doc async for doc in db.employees.aggregate(pipeline)]
    return [
        {
            "department":  r["_id"] or "Unassigned",
            "headcount":   r["headcount"],
            "total_gross": round(r["total_gross"], 2),
        }
        for r in result
    ]
