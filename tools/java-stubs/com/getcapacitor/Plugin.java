package com.getcapacitor;

import android.app.Activity;
import android.content.Context;

public class Plugin {
    protected void handleOnDestroy() {}
    public void load() {}
    public Context getContext() { return null; }
    public Activity getActivity() { return null; }
    public Bridge getBridge() { return null; }
}
