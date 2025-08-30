import { createServiceClient } from './supabase/server';

export interface CreditTransaction {
  userId: string;
  amount: number;
  transactionType: 'usage' | 'refund' | 'purchase' | 'bonus';
  description: string;
  videoId?: string;
  taskId?: string;
}

/**
 * Deduct credits from user account
 */
export async function deductCredits(
  userId: string, 
  amount: number, 
  description: string,
  taskId?: string
): Promise<{ success: boolean; remainingCredits?: number; error?: string }> {
  try {
    const supabase = createServiceClient();

    // Start transaction - get current credits
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('credits, total_credits_spent, total_videos_created')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return { success: false, error: 'Failed to fetch user profile' };
    }

    if (!profile) {
      return { success: false, error: 'User profile not found' };
    }

    if (profile.credits < amount) {
      return { success: false, error: 'Insufficient credits' };
    }

    // Update user credits
    const newCredits = profile.credits - amount;
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        credits: newCredits,
        total_credits_spent: (profile.total_credits_spent || 0) + amount,
        total_videos_created: (profile.total_videos_created || 0) + 1
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user credits:', updateError);
      return { success: false, error: 'Failed to update credits' };
    }

    // Log credit transaction
    const { error: transactionError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        transaction_type: 'usage',
        amount: -amount,
        description: taskId ? `${description} - Task: ${taskId}` : description,
        task_id: taskId,
        created_at: new Date().toISOString()
      });

    if (transactionError) {
      console.error('Error logging credit transaction:', transactionError);
      // Don't fail the operation if transaction logging fails
    }

    console.log(`✅ Deducted ${amount} credits from user ${userId}. Remaining: ${newCredits}`);
    
    return { success: true, remainingCredits: newCredits };

  } catch (error) {
    console.error('Error in deductCredits:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Refund credits to user account (for failed generations)
 */
export async function refundCredits(
  userId: string, 
  amount: number, 
  description: string,
  taskId?: string,
  videoId?: string
): Promise<{ success: boolean; newCredits?: number; error?: string }> {
  try {
    const supabase = createServiceClient();

    // Get current credits
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('credits, total_credits_spent')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile for refund:', profileError);
      return { success: false, error: 'Failed to fetch user profile' };
    }

    // Update user credits (add back the amount)
    const newCredits = profile.credits + amount;
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        credits: newCredits,
        // Optionally decrease total_credits_spent if you want to track net spending
        total_credits_spent: Math.max(0, (profile.total_credits_spent || 0) - amount)
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user credits for refund:', updateError);
      return { success: false, error: 'Failed to refund credits' };
    }

    // Log refund transaction
    const { error: transactionError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        video_id: videoId || null,
        transaction_type: 'refund',
        amount: amount, // Positive amount for refunds
        description: taskId ? `${description} - Task: ${taskId}` : description,
        task_id: taskId,
        created_at: new Date().toISOString()
      });

    if (transactionError) {
      console.error('Error logging refund transaction:', transactionError);
      // Don't fail the operation if transaction logging fails
    }

    console.log(`💰 Refunded ${amount} credits to user ${userId}. New balance: ${newCredits}`);
    
    return { success: true, newCredits };

  } catch (error) {
    console.error('Error in refundCredits:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get user's current credit balance
 */
export async function getUserCredits(userId: string): Promise<{ credits: number; error?: string }> {
  try {
    const supabase = createServiceClient();
    
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error('Error fetching user credits:', error);
      return { credits: 0, error: 'Failed to fetch credits' };
    }

    return { credits: profile.credits || 0 };

  } catch (error) {
    console.error('Error in getUserCredits:', error);
    return { credits: 0, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Add credits to user account (for bonuses, rewards, etc.)
 */
export async function addCredits(
  userId: string, 
  amount: number, 
  description: string,
  transactionType: 'bonus' | 'purchase' = 'bonus',
  metadata?: {
    checkInId?: string;
    referralId?: string;
    freeCreditsType?: string;
  }
): Promise<{ success: boolean; newCredits?: number; error?: string }> {
  try {
    const supabase = createServiceClient();

    // Get current credits
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile for credit addition:', profileError);
      return { success: false, error: 'Failed to fetch user profile' };
    }

    // Update user credits (add the amount)
    const newCredits = profile.credits + amount;
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        credits: newCredits,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating user credits:', updateError);
      return { success: false, error: 'Failed to add credits' };
    }

    // Log credit transaction
    const transactionData = {
      user_id: userId,
      transaction_type: transactionType,
      amount: amount, // Positive amount for additions
      description,
      created_at: new Date().toISOString(),
      ...(metadata?.checkInId && { check_in_id: metadata.checkInId }),
      ...(metadata?.referralId && { referral_id: metadata.referralId }),
      ...(metadata?.freeCreditsType && { free_credits_type: metadata.freeCreditsType })
    };

    const { error: transactionError } = await supabase
      .from('credit_transactions')
      .insert(transactionData);

    if (transactionError) {
      console.error('Error logging credit transaction:', transactionError);
      // Don't fail the operation if transaction logging fails
    }

    console.log(`🎁 Added ${amount} credits to user ${userId}. New balance: ${newCredits}`);
    
    return { success: true, newCredits };

  } catch (error) {
    console.error('Error in addCredits:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Record a successful video completion (updates transaction with video_id)
 */
export async function recordVideoCompletion(
  userId: string,
  taskId: string,
  videoId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceClient();

    // Update the credit transaction with the video_id
    const { error: updateError } = await supabase
      .from('credit_transactions')
      .update({ 
        video_id: videoId,
        description: `Video generation completed - Task: ${taskId}, Video: ${videoId}`
      })
      .eq('user_id', userId)
      .eq('transaction_type', 'usage')
      .like('description', `%Task: ${taskId}%`)
      .is('video_id', null); // Only update if video_id is not set yet

    if (updateError) {
      console.error('Error updating credit transaction with video_id:', updateError);
      return { success: false, error: 'Failed to update transaction record' };
    }

    console.log(`📝 Updated credit transaction for task ${taskId} with video_id ${videoId}`);
    return { success: true };

  } catch (error) {
    console.error('Error in recordVideoCompletion:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}