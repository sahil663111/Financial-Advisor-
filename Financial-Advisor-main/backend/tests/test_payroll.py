import pytest
from app.business.payroll.employee_service import compute_salary_summary
from app.business.payroll.schemas import (
    PF_EMPLOYEE_RATE, PF_EMPLOYER_RATE, PF_WAGE_CEILING,
    ESIC_EMPLOYEE_RATE, ESIC_EMPLOYER_RATE, ESIC_WAGE_CEILING
)

def test_compute_salary_summary_basic():
    """Test basic salary calculation without exceeding ceilings."""
    emp = {
        "basic_salary": 10000.0,
        "hra": 5000.0,
        "special_allowance": 2000.0,
        "other_allowances": 1000.0,
        "pf_applicable": True,
        "tds_monthly": 500.0,
        "professional_tax": 200.0,
        "other_deductions": 0.0
    }
    summary = compute_salary_summary(emp)
    
    assert summary["gross_salary"] == 18000.0
    assert summary["pf_employee"] == 1200.0  # 12% of 10000
    assert summary["pf_employer"] == 1200.0  # 12% of 10000
    assert summary["esic_employee"] == 135.0  # 0.75% of 18000
    assert summary["esic_employer"] == 585.0  # 3.25% of 18000
    assert summary["total_deductions"] == 1200.0 + 135.0 + 500.0 + 200.0
    assert summary["net_salary"] == 18000.0 - summary["total_deductions"]

def test_compute_salary_summary_pf_ceiling():
    """Test that PF calculation caps out at PF_WAGE_CEILING."""
    emp = {
        "basic_salary": 20000.0,  # Above 15,000 ceiling
        "pf_applicable": True
    }
    summary = compute_salary_summary(emp)
    
    expected_pf = round(PF_WAGE_CEILING * PF_EMPLOYEE_RATE, 2)
    assert summary["pf_employee"] == expected_pf
    assert summary["pf_employer"] == expected_pf

def test_compute_salary_summary_esic_ceiling():
    """Test that ESIC is not applied if gross exceeds ESIC_WAGE_CEILING."""
    emp = {
        "basic_salary": 20000.0,
        "hra": 5000.0,  # Gross = 25000 (above 21000 ceiling)
        "pf_applicable": False
    }
    summary = compute_salary_summary(emp)
    
    assert summary["gross_salary"] == 25000.0
    assert summary["esic_employee"] == 0.0
    assert summary["esic_employer"] == 0.0

def test_compute_salary_summary_no_pf():
    """Test salary calculation with PF disabled."""
    emp = {
        "basic_salary": 10000.0,
        "pf_applicable": False
    }
    summary = compute_salary_summary(emp)
    
    assert summary["pf_employee"] == 0.0
    assert summary["pf_employer"] == 0.0
