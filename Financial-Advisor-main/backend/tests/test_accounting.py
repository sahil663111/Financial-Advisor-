import pytest
from app.business.accounting.journal_service import _balance_delta

def test_balance_delta_asset():
    """Test balance delta for ASSET accounts (debit normal)."""
    assert _balance_delta("ASSET", debit=100.0, credit=0.0) == 100.0
    assert _balance_delta("ASSET", debit=0.0, credit=50.0) == -50.0
    assert _balance_delta("ASSET", debit=100.0, credit=50.0) == 50.0

def test_balance_delta_expense():
    """Test balance delta for EXPENSE accounts (debit normal)."""
    assert _balance_delta("EXPENSE", debit=200.0, credit=0.0) == 200.0
    assert _balance_delta("EXPENSE", debit=0.0, credit=20.0) == -20.0

def test_balance_delta_liability():
    """Test balance delta for LIABILITY accounts (credit normal)."""
    assert _balance_delta("LIABILITY", debit=0.0, credit=300.0) == 300.0
    assert _balance_delta("LIABILITY", debit=50.0, credit=0.0) == -50.0
    assert _balance_delta("LIABILITY", debit=50.0, credit=300.0) == 250.0

def test_balance_delta_equity():
    """Test balance delta for EQUITY accounts (credit normal)."""
    assert _balance_delta("EQUITY", debit=0.0, credit=1000.0) == 1000.0
    assert _balance_delta("EQUITY", debit=100.0, credit=0.0) == -100.0

def test_balance_delta_revenue():
    """Test balance delta for REVENUE accounts (credit normal)."""
    assert _balance_delta("REVENUE", debit=0.0, credit=500.0) == 500.0
    assert _balance_delta("REVENUE", debit=50.0, credit=0.0) == -50.0
