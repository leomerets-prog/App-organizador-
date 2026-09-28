package com.google.android.gms.tasks;

public abstract class Task<TResult> {
    public abstract Task<TResult> addOnSuccessListener(OnSuccessListener<? super TResult> listener);
    public abstract Task<TResult> addOnFailureListener(OnFailureListener listener);
}
