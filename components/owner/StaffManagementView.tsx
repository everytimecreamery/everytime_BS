'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listStaffManagementDataAction,
  createStaffMemberAction,
  updateStaffMemberAction,
  setStaffMemberActiveAction,
  type StaffMemberRecord,
  type StaffStoreOption,
} from '@/app/actions/staff';
import {
  Users,
  UserPlus,
  Pencil,
  Ban,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  X,
  RotateCcw,
} from 'lucide-react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CASHIER_CODE_REGEX = /^[A-Za-z0-9_-]{1,20}$/;
const PHONE_ALLOWED_REGEX = /^[0-9+\-()\s]{7,30}$/;

export function StaffManagementView() {
  const [stores, setStores] = useState<StaffStoreOption[]>([]);
  const [employees, setEmployees] = useState<StaffMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Add/Edit Modal state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<StaffMemberRecord | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [storeId, setStoreId] = useState('');
  const [cashierCode, setCashierCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Deactivation confirmation modal & status toggle state
  const [deactivateTarget, setDeactivateTarget] = useState<StaffMemberRecord | null>(null);
  const [busyStatusId, setBusyStatusId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await listStaffManagementDataAction();
      if (!res.success || !res.data) {
        setErrorMessage(res.error || 'Unable to load employee records.');
        return;
      }

      const loadedStores = res.data.stores || [];
      setStores(loadedStores);
      setEmployees(res.data.staffMembers || []);
      if (loadedStores.length > 0) {
        setStoreId((prev) => prev || loadedStores[0].id);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to load employee records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const storeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const store of stores) {
      map.set(store.id, store.name);
    }
    return map;
  }, [stores]);

  const activeCount = useMemo(
    () => employees.filter((emp) => emp.is_active).length,
    [employees]
  );

  const openAddModal = () => {
    setEditingEmployee(null);
    setFullName('');
    setEmail('');
    setPhone('');
    setStoreId(stores[0]?.id || '');
    setCashierCode('');
    setFormError(null);
    setFormModalOpen(true);
  };

  const openEditModal = (employee: StaffMemberRecord) => {
    setEditingEmployee(employee);
    setFullName(employee.full_name);
    setEmail(employee.email || '');
    setPhone(employee.phone || '');
    setStoreId(employee.store_id);
    setCashierCode(employee.cashier_code);
    setFormError(null);
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    if (isSaving) return;
    setFormModalOpen(false);
    setEditingEmployee(null);
    setFormError(null);
  };

  const validateClientForm = (): string | null => {
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      return 'Full name is required.';
    }
    if (trimmedName.length > 120) {
      return 'Full name must be 120 characters or fewer.';
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      return 'Please enter a valid email address.';
    }

    const trimmedPhone = phone.trim();
    if (trimmedPhone) {
      const digits = trimmedPhone.replace(/\D/g, '').length;
      if (!PHONE_ALLOWED_REGEX.test(trimmedPhone) || digits < 7 || digits > 15) {
        return 'Contact number must contain 7 to 15 digits.';
      }
    }

    if (!storeId) {
      return 'Please select an assigned store.';
    }

    const trimmedCode = cashierCode.trim();
    if (!trimmedCode) {
      return 'Unique cashier code is required.';
    }
    if (!CASHIER_CODE_REGEX.test(trimmedCode)) {
      return 'Cashier code must be 1–20 characters (letters, numbers, hyphens, or underscores).';
    }

    return null;
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    const validationError = validateClientForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        fullName: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        storeId,
        cashierCode: cashierCode.trim().toUpperCase(),
      };

      const res = editingEmployee
        ? await updateStaffMemberAction(editingEmployee.id, payload)
        : await createStaffMemberAction(payload);

      if (!res.success) {
        setFormError(res.error || 'Failed to save employee record.');
        return;
      }

      const savedName = res.data?.full_name || payload.fullName;
      setFormModalOpen(false);
      setEditingEmployee(null);
      setSuccessMessage(
        editingEmployee
          ? `Updated employee record for ${savedName}.`
          : `Added employee ${savedName} (${payload.cashierCode}).`
      );
      await loadData();
    } catch (err: any) {
      setFormError(err?.message || 'Unexpected error while saving employee record.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (employee: StaffMemberRecord, nextActive: boolean) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setBusyStatusId(employee.id);

    try {
      const res = await setStaffMemberActiveAction(employee.id, nextActive);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update employee status.');
        return;
      }

      setDeactivateTarget(null);
      setSuccessMessage(
        nextActive
          ? `${employee.full_name} is now Active.`
          : `${employee.full_name} has been marked Inactive.`
      );
      await loadData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error while updating employee status.');
    } finally {
      setBusyStatusId(null);
    }
  };

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-[#E8E3C3] p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-[#222222] tracking-tight">
              Employees
            </h2>
            <p className="text-xs text-[#777777] mt-0.5">
              {employees.length === 0
                ? 'Maintain your store employee directory and cashier codes.'
                : `${activeCount} active · ${employees.length} total employee${employees.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            aria-label="Refresh Employees"
            className="h-9 px-3 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#C43C1E]' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="h-9 px-4 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      {/* Employee Table / Empty State */}
      <div className="bg-white rounded-2xl border border-[#E8E3C3] shadow-xs overflow-hidden">
        {loading && employees.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#777777] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#C43C1E]" />
            <span>Loading employees...</span>
          </div>
        ) : employees.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#222222]">No employees added yet</h3>
              <p className="text-xs text-[#777777] max-w-sm mx-auto mt-1">
                Add your store employees with their assigned store and unique cashier code to keep staff records organized.
              </p>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Employee</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8E8] text-[#777777] font-bold border-b border-[#E8E3C3]">
                <tr>
                  <th className="py-3 px-4">Employee Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Contact Number</th>
                  <th className="py-3 px-4">Assigned Store</th>
                  <th className="py-3 px-4">Cashier Code</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E3C3]/60">
                {employees.map((employee) => {
                  const isActive = employee.is_active;
                  const storeName = storeNameById.get(employee.store_id) || 'Unknown Store';
                  const isBusy = busyStatusId === employee.id;

                  return (
                    <tr
                      key={employee.id}
                      data-status={isActive ? 'active' : 'inactive'}
                      className={
                        isActive
                          ? 'bg-white hover:bg-[#FAF8E8]/40 transition-colors'
                          : 'bg-zinc-50/90 text-[#777777] transition-colors'
                      }
                    >
                      <td className="py-3 px-4 font-bold text-[#222222]">
                        <span className={isActive ? '' : 'text-[#777777]'}>
                          {employee.full_name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#555555]">
                        {employee.email || <span className="text-[#AAAAAA]">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[#555555] tabular-nums">
                        {employee.phone || <span className="text-[#AAAAAA]">—</span>}
                      </td>
                      <td className="py-3 px-4 text-[#555555]">{storeName}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#FAF8E8] border border-[#E8E3C3] font-bold text-[#C43C1E] tabular-nums">
                          {employee.cashier_code}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-zinc-100 text-zinc-600 border-zinc-300'
                            }`}
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(employee)}
                            disabled={isBusy}
                            aria-label={`Edit ${employee.full_name}`}
                            className="px-2.5 py-1.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-[#222222] text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Pencil className="w-3 h-3 text-[#777777]" />
                            <span>Edit</span>
                          </button>

                          {isActive ? (
                            <button
                              type="button"
                              onClick={() => setDeactivateTarget(employee)}
                              disabled={isBusy}
                              aria-label={`Deactivate ${employee.full_name}`}
                              className="px-2.5 py-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Ban className="w-3 h-3" />
                              <span>Deactivate</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(employee, true)}
                              disabled={isBusy}
                              aria-label={`Activate ${employee.full_name}`}
                              className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3" />
                              )}
                              <span>{isBusy ? 'Activating...' : 'Activate'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Employee Dialog */}
      {formModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingEmployee ? 'Edit Employee' : 'Add Employee'}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs"
        >
          <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E8E3C3] bg-[#FAF8E8]/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#C43C1E] text-white flex items-center justify-center shadow-xs">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#222222]">
                    {editingEmployee ? `Edit Employee: ${editingEmployee.full_name}` : 'Add Employee'}
                  </h3>
                  <p className="text-[11px] text-[#777777]">
                    Store employee record & cashier code
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeFormModal}
                disabled={isSaving}
                aria-label="Close employee dialog"
                className="p-1.5 rounded-lg text-[#777777] hover:text-[#222222] hover:bg-[#E8E3C3]/40 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} noValidate className="p-5 space-y-4">
              {formError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label htmlFor="employee-full-name" className="block text-xs font-bold text-[#222222] mb-1">
                  Full Name <span className="text-[#C43C1E]">*</span>
                </label>
                <input
                  id="employee-full-name"
                  type="text"
                  required
                  placeholder="e.g. Priya Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isSaving}
                  className="w-full h-9 px-3 rounded-xl border border-[#E8E3C3] text-xs text-[#222222] focus:outline-none focus:border-[#C43C1E]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="employee-cashier-code" className="block text-xs font-bold text-[#222222] mb-1">
                    Unique Cashier Code <span className="text-[#C43C1E]">*</span>
                  </label>
                  <input
                    id="employee-cashier-code"
                    type="text"
                    required
                    placeholder="e.g. C01"
                    value={cashierCode}
                    onChange={(e) => setCashierCode(e.target.value)}
                    disabled={isSaving}
                    className="w-full h-9 px-3 rounded-xl border border-[#E8E3C3] text-xs text-[#222222] uppercase focus:outline-none focus:border-[#C43C1E]"
                  />
                </div>

                <div>
                  <label htmlFor="employee-store" className="block text-xs font-bold text-[#222222] mb-1">
                    Assigned Store <span className="text-[#C43C1E]">*</span>
                  </label>
                  <select
                    id="employee-store"
                    required
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    disabled={isSaving || stores.length === 0}
                    className="w-full h-9 px-2.5 rounded-xl border border-[#E8E3C3] bg-white text-xs text-[#222222] focus:outline-none focus:border-[#C43C1E]"
                  >
                    {stores.length === 0 ? (
                      <option value="">No stores available</option>
                    ) : (
                      stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="employee-email" className="block text-xs font-bold text-[#222222] mb-1">
                  Employee Email <span className="text-[#777777] font-normal">(optional)</span>
                </label>
                <input
                  id="employee-email"
                  type="email"
                  placeholder="employee@everytimecreamery.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSaving}
                  className="w-full h-9 px-3 rounded-xl border border-[#E8E3C3] text-xs text-[#222222] focus:outline-none focus:border-[#C43C1E]"
                />
              </div>

              <div>
                <label htmlFor="employee-phone" className="block text-xs font-bold text-[#222222] mb-1">
                  Contact Number <span className="text-[#777777] font-normal">(optional)</span>
                </label>
                <input
                  id="employee-phone"
                  type="tel"
                  placeholder="e.g. +91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isSaving}
                  className="w-full h-9 px-3 rounded-xl border border-[#E8E3C3] text-xs text-[#222222] focus:outline-none focus:border-[#C43C1E]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8E3C3]">
                <button
                  type="button"
                  onClick={closeFormModal}
                  disabled={isSaving}
                  className="h-9 px-4 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="h-9 px-4 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {isSaving
                      ? 'Saving...'
                      : editingEmployee
                        ? 'Save Changes'
                        : 'Add Employee'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Deactivation Dialog */}
      {deactivateTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Deactivate ${deactivateTarget.full_name}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs"
        >
          <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-md shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 border border-red-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-[#222222]">
                  Deactivate {deactivateTarget.full_name}?
                </h3>
                <p className="text-xs text-[#777777] mt-0.5">
                  Cashier Code: {deactivateTarget.cashier_code}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#555555] bg-[#FAF8E8] p-3.5 rounded-xl border border-[#E8E3C3] leading-relaxed">
              This employee will be marked as <strong>Inactive</strong> and will no longer be counted as an active employee. Their record will stay visible in the employee list and can be reactivated at any time.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E8E3C3]">
              <button
                type="button"
                onClick={() => setDeactivateTarget(null)}
                disabled={busyStatusId === deactivateTarget.id}
                className="h-9 px-4 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(deactivateTarget, false)}
                disabled={busyStatusId === deactivateTarget.id}
                className="h-9 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                {busyStatusId === deactivateTarget.id && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>
                  {busyStatusId === deactivateTarget.id ? 'Deactivating...' : 'Confirm Deactivate'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
